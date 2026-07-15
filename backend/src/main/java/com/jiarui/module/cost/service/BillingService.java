package com.jiarui.module.cost.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jiarui.common.exception.BusinessException;
import com.jiarui.module.cost.entity.BillingStatement;
import com.jiarui.module.cost.entity.BillingItem;
import com.jiarui.module.cost.mapper.BillingStatementMapper;
import com.jiarui.module.cost.mapper.BillingItemMapper;
import com.jiarui.module.order.entity.Customer;
import com.jiarui.module.order.entity.Waybill;
import com.jiarui.module.order.entity.WaybillStop;
import com.jiarui.module.order.mapper.CustomerMapper;
import com.jiarui.module.order.mapper.WaybillMapper;
import com.jiarui.module.order.mapper.WaybillStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BillingService {

    private final BillingStatementMapper billingStatementMapper;
    private final BillingItemMapper billingItemMapper;
    private final WaybillMapper waybillMapper;
    private final WaybillStopMapper waybillStopMapper;
    private final CustomerMapper customerMapper;

    /**
     * 生成客户月结对账单
     * 自动汇总该客户上月所有已完成、未入账的运单
     */
    @Transactional
    public BillingStatement generateMonthlyBilling(Long customerId, int year, int month) {
        Customer customer = customerMapper.selectById(customerId);
        if (customer == null) throw BusinessException.notFound("客户不存在");
        if (!"monthly".equals(customer.getSettlementType())) {
            throw BusinessException.badRequest("该客户不是月结客户");
        }

        LocalDate periodStart = LocalDate.of(year, month, 1);
        LocalDate periodEnd = periodStart.plusMonths(1).minusDays(1);

        // 查该客户在账期内已完成且未入账的运单
        List<Waybill> waybills = waybillMapper.selectList(
                new LambdaQueryWrapper<Waybill>()
                        .eq(Waybill::getCustomerId, customerId)
                        .eq(Waybill::getStatus, "completed")
                        .eq(Waybill::getSettlementStatus, "pending")
                        .between(Waybill::getCreatedAt,
                                periodStart.atStartOfDay(),
                                periodEnd.plusDays(1).atStartOfDay()));

        if (waybills.isEmpty()) {
            throw BusinessException.badRequest("该账期内没有待入账的运单");
        }

        // 计算总金额
        BigDecimal totalAmount = waybills.stream()
                .map(Waybill::getQuotedFee)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 创建对账单
        String statementNo = String.format("ZD%s%04d",
                periodStart.format(DateTimeFormatter.ofPattern("yyyyMM")),
                billingStatementMapper.selectCount(null) + 1);

        BillingStatement statement = new BillingStatement();
        statement.setStatementNo(statementNo);
        statement.setCustomerId(customerId);
        statement.setPeriodStart(periodStart);
        statement.setPeriodEnd(periodEnd);
        statement.setTotalAmount(totalAmount);
        statement.setWaybillCount(waybills.size());
        statement.setStatus("draft");
        billingStatementMapper.insert(statement);

        // 创建对账明细
        for (Waybill w : waybills) {
            List<WaybillStop> stops = waybillStopMapper.selectByWaybillId(w.getId());
            String departure = stops.stream()
                    .filter(s -> "pickup".equals(s.getStopType()))
                    .findFirst().map(s -> s.getCity() + s.getDistrict()).orElse("");
            String destination = stops.stream()
                    .filter(s -> "delivery".equals(s.getStopType()))
                    .reduce((first, second) -> second)  // 最后一个卸货点
                    .map(s -> s.getCity() + s.getDistrict()).orElse("");

            BillingItem item = new BillingItem();
            item.setStatementId(statement.getId());
            item.setWaybillId(w.getId());
            item.setWaybillNo(w.getWaybillNo());
            item.setDeparture(departure);
            item.setDestination(destination);
            item.setCargoDesc(w.getCargoName());
            item.setAmount(w.getQuotedFee());
            item.setTripDate(w.getCreatedAt().toLocalDate());
            billingItemMapper.insert(item);

            // 标记运单为已入账
            w.setSettlementStatus("invoiced");
            waybillMapper.updateById(w);
        }

        return statement;
    }

    /** 发送对账单给客户（状态 draft→sent） */
    @Transactional
    public BillingStatement sendToCustomer(Long statementId) {
        BillingStatement statement = billingStatementMapper.selectById(statementId);
        if (statement == null) throw BusinessException.notFound("对账单不存在");
        if (!"draft".equals(statement.getStatus())) {
            throw BusinessException.badRequest("只有草稿状态才能发送");
        }
        statement.setStatus("sent");
        billingStatementMapper.updateById(statement);
        // TODO: 推送微信模板消息通知客户
        return statement;
    }

    /** 客户确认对账单 */
    @Transactional
    public BillingStatement confirm(Long statementId) {
        BillingStatement statement = billingStatementMapper.selectById(statementId);
        if (statement == null) throw BusinessException.notFound("对账单不存在");
        statement.setStatus("confirmed");
        statement.setConfirmedAt(java.time.LocalDateTime.now());
        billingStatementMapper.updateById(statement);
        return statement;
    }

    /** 查询客户的对账单列表 */
    public List<BillingStatement> listByCustomer(Long customerId) {
        return billingStatementMapper.selectList(
                new LambdaQueryWrapper<BillingStatement>()
                        .eq(BillingStatement::getCustomerId, customerId)
                        .orderByDesc(BillingStatement::getCreatedAt));
    }
}
