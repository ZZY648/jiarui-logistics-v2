package com.jiarui.module.cost.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jiarui.module.cost.entity.CostAllocation;
import com.jiarui.module.cost.entity.CostAllocationDetail;
import com.jiarui.module.cost.mapper.CostAllocationMapper;
import com.jiarui.module.cost.mapper.CostAllocationDetailMapper;
import com.jiarui.module.dispatch.entity.Vehicle;
import com.jiarui.module.dispatch.mapper.VehicleMapper;
import com.jiarui.module.order.entity.Waybill;
import com.jiarui.module.order.entity.WaybillVehicle;
import com.jiarui.module.order.mapper.WaybillMapper;
import com.jiarui.module.order.mapper.WaybillVehicleMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 间接成本分摊服务
 * 将折旧/保险/维修等按月汇总 → 按趟均摊到每个运单
 */
@Service
@RequiredArgsConstructor
public class CostAllocationService {

    private final CostAllocationMapper costAllocationMapper;
    private final CostAllocationDetailMapper costAllocationDetailMapper;
    private final VehicleMapper vehicleMapper;
    private final WaybillMapper waybillMapper;
    private final WaybillVehicleMapper waybillVehicleMapper;

    /**
     * 录入间接成本（月折旧/保险/维修等）
     * 录入后自动按当月趟数分摊
     */
    @Transactional
    public CostAllocation recordAndAllocate(Long vehicleId, String costType,
                                             BigDecimal totalAmount, int year, int month) {
        Vehicle vehicle = vehicleMapper.selectById(vehicleId);
        LocalDate periodStart = LocalDate.of(year, month, 1);
        LocalDate periodEnd = periodStart.plusMonths(1).minusDays(1);

        // 1. 创建分摊规则
        CostAllocation allocation = new CostAllocation();
        allocation.setVehicleId(vehicleId);
        allocation.setCostType(costType);
        allocation.setTotalAmount(totalAmount);
        allocation.setPeriodStart(periodStart);
        allocation.setPeriodEnd(periodEnd);
        allocation.setAllocRule("per_trip");
        allocation.setRemark(String.format("%d年%d月%s分摊", year, month, costTypeLabel(costType)));
        costAllocationMapper.insert(allocation);

        // 2. 查该车辆在当月的所有已完成运单
        List<WaybillVehicle> wvList = waybillVehicleMapper.selectList(
                new LambdaQueryWrapper<WaybillVehicle>()
                        .eq(WaybillVehicle::getVehicleId, vehicleId)
                        .between(WaybillVehicle::getAssignedAt,
                                periodStart.atStartOfDay(),
                                periodEnd.plusDays(1).atStartOfDay()));

        if (wvList.isEmpty()) {
            // 没有运单可以分摊，规则留着等月底再分摊
            return allocation;
        }

        // 3. 按趟均摊
        BigDecimal perTrip = totalAmount.divide(
                BigDecimal.valueOf(wvList.size()), 2, RoundingMode.HALF_UP);
        // 处理除不尽的情况：最后一趟补齐差额
        BigDecimal allocatedSoFar = BigDecimal.ZERO;

        for (int i = 0; i < wvList.size(); i++) {
            WaybillVehicle wv = wvList.get(i);
            BigDecimal amount;
            if (i == wvList.size() - 1) {
                amount = totalAmount.subtract(allocatedSoFar);
            } else {
                amount = perTrip;
                allocatedSoFar = allocatedSoFar.add(perTrip);
            }

            // 查是否已有该分摊明细(避免重复)
            Long existCount = costAllocationDetailMapper.selectCount(
                    new LambdaQueryWrapper<CostAllocationDetail>()
                            .eq(CostAllocationDetail::getAllocationId, allocation.getId())
                            .eq(CostAllocationDetail::getWaybillId, wv.getWaybillId()));
            if (existCount > 0) continue;

            CostAllocationDetail detail = new CostAllocationDetail();
            detail.setAllocationId(allocation.getId());
            detail.setWaybillId(wv.getWaybillId());
            detail.setAllocatedAmount(amount);
            costAllocationDetailMapper.insert(detail);
        }

        return allocation;
    }

    /**
     * 每月自动录入车辆的固定成本（折旧 + 保险）
     * 由定时任务在月初调用
     */
    @Transactional
    public void autoRecordFixedCosts(int year, int month) {
        List<Vehicle> vehicles = vehicleMapper.selectList(null);
        for (Vehicle vehicle : vehicles) {
            if (vehicle.getMonthlyDepreciation().compareTo(BigDecimal.ZERO) > 0) {
                recordAndAllocate(vehicle.getId(), "depreciation",
                        vehicle.getMonthlyDepreciation(), year, month);
            }
            if (vehicle.getMonthlyInsurance().compareTo(BigDecimal.ZERO) > 0) {
                recordAndAllocate(vehicle.getId(), "insurance",
                        vehicle.getMonthlyInsurance(), year, month);
            }
        }
    }

    /** 获取某运单的所有分摊明细 */
    public List<CostAllocationDetail> getWaybillAllocationDetails(Long waybillId) {
        return costAllocationDetailMapper.selectList(
                new LambdaQueryWrapper<CostAllocationDetail>()
                        .eq(CostAllocationDetail::getWaybillId, waybillId));
    }

    /** 某运单的间接成本总和 */
    public BigDecimal getIndirectCostTotal(Long waybillId) {
        List<CostAllocationDetail> details = getWaybillAllocationDetails(waybillId);
        return details.stream()
                .map(CostAllocationDetail::getAllocatedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private String costTypeLabel(String costType) {
        return Map.of(
            "depreciation", "折旧",
            "insurance",    "保险",
            "maintenance",  "维修",
            "annual_fee",   "年检"
        ).getOrDefault(costType, costType);
    }
}
