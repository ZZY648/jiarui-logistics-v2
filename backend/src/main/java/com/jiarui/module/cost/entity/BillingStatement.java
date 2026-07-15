package com.jiarui.module.cost.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("billing_statement")
public class BillingStatement {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String statementNo;
    private Long customerId;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private BigDecimal totalAmount;
    private Integer waybillCount;
    private String status;
    private LocalDateTime confirmedAt;
    private LocalDateTime invoicedAt;
    private String invoiceNo;
    private LocalDateTime paidAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
