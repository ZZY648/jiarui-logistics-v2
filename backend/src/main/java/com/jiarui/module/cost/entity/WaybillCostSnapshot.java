package com.jiarui.module.cost.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("waybill_cost_snapshot")
public class WaybillCostSnapshot {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long waybillId;
    private BigDecimal quotedFee;
    private BigDecimal directFuel;
    private BigDecimal directToll;
    private BigDecimal directDriverPay;
    private BigDecimal directLoading;
    private BigDecimal directOther;
    private BigDecimal indirectDepreciation;
    private BigDecimal indirectInsurance;
    private BigDecimal indirectMaintenance;
    private BigDecimal totalCost;
    private BigDecimal profit;
    private BigDecimal profitMargin;
    private LocalDateTime calculatedAt;
}
