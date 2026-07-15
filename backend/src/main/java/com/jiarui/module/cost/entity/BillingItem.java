package com.jiarui.module.cost.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@TableName("billing_item")
public class BillingItem {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long statementId;
    private Long waybillId;
    private String waybillNo;
    private String departure;
    private String destination;
    private String cargoDesc;
    private BigDecimal amount;
    private LocalDate tripDate;
}
