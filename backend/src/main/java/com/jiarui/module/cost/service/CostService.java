package com.jiarui.module.cost.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jiarui.module.cost.entity.CostItem;
import com.jiarui.module.cost.entity.CostAllocation;
import com.jiarui.module.cost.entity.CostAllocationDetail;
import com.jiarui.module.cost.entity.WaybillCostSnapshot;
import com.jiarui.module.cost.mapper.CostItemMapper;
import com.jiarui.module.cost.mapper.CostAllocationMapper;
import com.jiarui.module.cost.mapper.CostAllocationDetailMapper;
import com.jiarui.module.cost.mapper.WaybillCostSnapshotMapper;
import com.jiarui.module.order.entity.Waybill;
import com.jiarui.module.order.entity.WaybillVehicle;
import com.jiarui.module.order.mapper.WaybillMapper;
import com.jiarui.module.order.mapper.WaybillVehicleMapper;
import com.jiarui.module.dispatch.entity.Vehicle;
import com.jiarui.module.dispatch.mapper.VehicleMapper;
import com.jiarui.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class CostService {

    private final CostItemMapper costItemMapper;
    private final CostAllocationMapper costAllocationMapper;
    private final CostAllocationDetailMapper costAllocationDetailMapper;
    private final WaybillCostSnapshotMapper costSnapshotMapper;
    private final WaybillMapper waybillMapper;
    private final WaybillVehicleMapper waybillVehicleMapper;
    private final VehicleMapper vehicleMapper;

    /**
     * 记录直接费用（司机上传加油票 / 过路费等）
     */
    @Transactional
    public CostItem recordDirectCost(Long waybillId, String costType,
                                      BigDecimal amount, String desc, String receiptUrl) {
        CostItem item = new CostItem();
        item.setWaybillId(waybillId);
        item.setCostType(costType);
        item.setCostAmount(amount);
        item.setCostDesc(desc);
        item.setReceiptImage(receiptUrl);
        item.setVerifyStatus("pending");
        item.setOccurredAt(LocalDateTime.now());
        costItemMapper.insert(item);
        return item;
    }

    /**
     * 财务审核费用
     */
    @Transactional
    public CostItem verifyCost(Long costId, boolean approved, String rejectReason) {
        CostItem item = costItemMapper.selectById(costId);
        if (item == null) throw BusinessException.notFound("费用记录不存在");
        item.setVerifyStatus(approved ? "verified" : "rejected");
        if (!approved) item.setRejectReason(rejectReason);
        costItemMapper.updateById(item);
        return item;
    }

    /**
     * 计算单趟运输完整成本 + 生成快照
     * 触发时机：运单签收完成后调用
     */
    @Transactional
    public WaybillCostSnapshot calculateTripCost(Long waybillId) {
        Waybill waybill = waybillMapper.selectById(waybillId);
        if (waybill == null) throw BusinessException.notFound("运单不存在");

        // 1. 汇总已审核的直接成本
        List<CostItem> directCosts = costItemMapper.selectList(
                new LambdaQueryWrapper<CostItem>()
                        .eq(CostItem::getWaybillId, waybillId)
                        .eq(CostItem::getVerifyStatus, "verified"));

        BigDecimal directFuel   = sumByType(directCosts, "fuel");
        BigDecimal directToll   = sumByType(directCosts, "toll");
        BigDecimal directDriver = sumByType(directCosts, "driver_pay");
        BigDecimal directLoad   = sumByType(directCosts, "loading");
        BigDecimal directOther  = sumOther(directCosts);

        // 2. 计算间接成本分摊
        // 找到本次运输使用的车辆
        WaybillVehicle wv = waybillVehicleMapper.selectOne(
                new LambdaQueryWrapper<WaybillVehicle>().eq(WaybillVehicle::getWaybillId, waybillId));
        BigDecimal indirectDepreciation = BigDecimal.ZERO;
        BigDecimal indirectInsurance = BigDecimal.ZERO;
        BigDecimal indirectMaintenance = BigDecimal.ZERO;

        if (wv != null) {
            Vehicle vehicle = vehicleMapper.selectById(wv.getVehicleId());
            if (vehicle != null) {
                // 计算该车当月趟数
                Long monthlyTrips = waybillVehicleMapper.selectCount(
                        new LambdaQueryWrapper<WaybillVehicle>()
                                .eq(WaybillVehicle::getVehicleId, vehicle.getId())
                                .between(WaybillVehicle::getAssignedAt,
                                        LocalDate.now().withDayOfMonth(1).atStartOfDay(),
                                        LocalDate.now().plusMonths(1).withDayOfMonth(1).atStartOfDay()));
                if (monthlyTrips > 0) {
                    indirectDepreciation = vehicle.getMonthlyDepreciation()
                            .divide(BigDecimal.valueOf(monthlyTrips), 2, RoundingMode.HALF_UP);
                    indirectInsurance = vehicle.getMonthlyInsurance()
                            .divide(BigDecimal.valueOf(monthlyTrips), 2, RoundingMode.HALF_UP);
                }
            }
        }

        // 3. 汇总成本
        BigDecimal totalDirect = directFuel.add(directToll).add(directDriver)
                .add(directLoad).add(directOther);
        BigDecimal totalIndirect = indirectDepreciation.add(indirectInsurance).add(indirectMaintenance);
        BigDecimal totalCost = totalDirect.add(totalIndirect);
        BigDecimal profit = waybill.getQuotedFee().subtract(totalCost);
        BigDecimal profitMargin = waybill.getQuotedFee().compareTo(BigDecimal.ZERO) > 0
                ? profit.divide(waybill.getQuotedFee(), 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                : BigDecimal.ZERO;

        // 4. 写入快照
        WaybillCostSnapshot snapshot = new WaybillCostSnapshot();
        snapshot.setWaybillId(waybillId);
        snapshot.setQuotedFee(waybill.getQuotedFee());
        snapshot.setDirectFuel(directFuel);
        snapshot.setDirectToll(directToll);
        snapshot.setDirectDriverPay(directDriver);
        snapshot.setDirectLoading(directLoad);
        snapshot.setDirectOther(directOther);
        snapshot.setIndirectDepreciation(indirectDepreciation);
        snapshot.setIndirectInsurance(indirectInsurance);
        snapshot.setIndirectMaintenance(indirectMaintenance);
        snapshot.setTotalCost(totalCost);
        snapshot.setProfit(profit);
        snapshot.setProfitMargin(profitMargin);
        snapshot.setCalculatedAt(LocalDateTime.now());

        // 如果已有快照则更新，否则插入
        WaybillCostSnapshot existing = costSnapshotMapper.selectOne(
                new LambdaQueryWrapper<WaybillCostSnapshot>().eq(WaybillCostSnapshot::getWaybillId, waybillId));
        if (existing != null) {
            snapshot.setId(existing.getId());
            costSnapshotMapper.updateById(snapshot);
        } else {
            costSnapshotMapper.insert(snapshot);
        }
        return snapshot;
    }

    /** 查询某运单的成本快照 */
    public WaybillCostSnapshot getSnapshot(Long waybillId) {
        return costSnapshotMapper.selectOne(
                new LambdaQueryWrapper<WaybillCostSnapshot>().eq(WaybillCostSnapshot::getWaybillId, waybillId));
    }

    /** 按车辆统计月度利润 */
    public List<Map<String, Object>> monthlyProfitByVehicle(int year, int month) {
        // TODO: 聚合统计
        return Collections.emptyList();
    }

    private BigDecimal sumByType(List<CostItem> items, String type) {
        return items.stream()
                .filter(i -> type.equals(i.getCostType()))
                .map(CostItem::getCostAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumOther(List<CostItem> items) {
        Set<String> known = Set.of("fuel", "toll", "driver_pay", "loading");
        return items.stream()
                .filter(i -> !known.contains(i.getCostType()))
                .map(CostItem::getCostAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
