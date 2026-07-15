package com.jiarui.module.cost.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jiarui.module.cost.entity.PricingRule;
import com.jiarui.module.cost.mapper.PricingRuleMapper;
import com.jiarui.module.order.entity.Customer;
import com.jiarui.module.order.mapper.CustomerMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/**
 * 运费报价服务
 * 公式: (起步价 + 里程单价×里程 + 重量单价×重量) × 时效系数 × 货物系数 × 客户折扣
 */
@Service
@RequiredArgsConstructor
public class PricingService {

    private final PricingRuleMapper pricingRuleMapper;
    private final CustomerMapper customerMapper;

    // 时效系数
    private static final Map<String, BigDecimal> URGENCY_FACTOR = Map.of(
            "normal",   BigDecimal.valueOf(1.0),
            "urgent",   BigDecimal.valueOf(1.3),
            "appointed",BigDecimal.valueOf(1.2)
    );

    // 货物系数
    private static final Map<String, BigDecimal> CARGO_FACTOR = Map.of(
            "general",     BigDecimal.valueOf(1.0),
            "fragile",     BigDecimal.valueOf(1.15),
            "dangerous",   BigDecimal.valueOf(1.5),
            "cold_chain",  BigDecimal.valueOf(2.0)
    );

    /**
     * 计算报价
     * @param vehicleType 车型 small_truck / medium_truck / heavy_truck
     * @param distanceKm  预估里程(公里), 需提前通过腾讯地图 API 获取
     * @param weightKg    货物重量(公斤)
     * @param cargoType   货物类型
     * @param urgency     时效要求
     * @param customerId  客户 ID(用于查折扣)
     */
    public BigDecimal calculate(String vehicleType, double distanceKm, double weightKg,
                                 String cargoType, String urgency, Long customerId) {

        // 1. 取报价规则
        PricingRule rule = pricingRuleMapper.selectOne(
                new LambdaQueryWrapper<PricingRule>()
                        .eq(PricingRule::getVehicleType, vehicleType)
                        .isNull(PricingRule::getEffectiveTo)
                        .orderByDesc(PricingRule::getEffectiveFrom)
                        .last("LIMIT 1"));
        if (rule == null) {
            throw new RuntimeException("未找到车型 " + vehicleType + " 的报价规则");
        }

        // 2. 基础运费
        BigDecimal base = rule.getBaseFee()
                .add(rule.getPricePerKm().multiply(BigDecimal.valueOf(distanceKm)))
                .add(rule.getPricePerKg().multiply(BigDecimal.valueOf(weightKg)));

        // 不低于最低收费
        if (base.compareTo(rule.getMinCharge()) < 0) {
            base = rule.getMinCharge();
        }

        // 3. 乘系数
        BigDecimal urgencyFactor = URGENCY_FACTOR.getOrDefault(urgency, BigDecimal.ONE);
        BigDecimal cargoFactor   = CARGO_FACTOR.getOrDefault(cargoType, BigDecimal.ONE);

        BigDecimal result = base.multiply(urgencyFactor).multiply(cargoFactor);

        // 4. 客户折扣
        if (customerId != null) {
            Customer customer = customerMapper.selectById(customerId);
            if (customer != null && customer.getDiscountRate() != null) {
                result = result.multiply(customer.getDiscountRate());
            }
        }

        return result.setScale(2, RoundingMode.HALF_UP);
    }
}
