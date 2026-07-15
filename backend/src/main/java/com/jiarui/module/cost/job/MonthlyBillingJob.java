package com.jiarui.module.cost.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jiarui.module.cost.service.BillingService;
import com.jiarui.module.order.entity.Customer;
import com.jiarui.module.order.mapper.CustomerMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

/**
 * 月结对账定时任务
 * 每月 1 日凌晨 1:00 自动生成所有月结客户的上月对账单
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MonthlyBillingJob {

    private final BillingService billingService;
    private final CustomerMapper customerMapper;

    @Scheduled(cron = "0 0 1 1 * ?")
    public void generateMonthlyBilling() {
        LocalDate lastMonth = LocalDate.now().minusMonths(1);
        int year = lastMonth.getYear();
        int month = lastMonth.getMonthValue();

        // 查所有月结客户
        List<Customer> monthlyCustomers = customerMapper.selectList(
                new LambdaQueryWrapper<Customer>().eq(Customer::getSettlementType, "monthly"));

        int success = 0, skip = 0;
        for (Customer customer : monthlyCustomers) {
            try {
                billingService.generateMonthlyBilling(customer.getId(), year, month);
                success++;
            } catch (Exception e) {
                if (e.getMessage() != null && e.getMessage().contains("没有待入账")) {
                    skip++;
                } else {
                    log.error("生成客户 {} 对账单失败: {}", customer.getCustomerCode(), e.getMessage());
                }
            }
        }
        log.info("月结对账完成: 生成 {} 份, 跳过 {} 份(无账单)", success, skip);
    }
}
