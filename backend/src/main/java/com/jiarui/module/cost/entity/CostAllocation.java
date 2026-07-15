package com.jiarui.module.cost.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("cost_allocation")
public class CostAllocation {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long vehicleId;
    private String costType;
    private BigDecimal totalAmount;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private String allocRule;
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
