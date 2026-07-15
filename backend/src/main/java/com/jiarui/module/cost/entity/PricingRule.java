package com.jiarui.module.cost.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("pricing_rule")
public class PricingRule {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String vehicleType;
    private BigDecimal baseFee;
    private BigDecimal pricePerKm;
    private BigDecimal pricePerKg;
    private BigDecimal minCharge;
    private LocalDate effectiveFrom;
    private LocalDate effectiveTo;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
