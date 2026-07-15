package com.jiarui.module.cost.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("cost_item")
public class CostItem {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long waybillId;
    private String costType;
    private BigDecimal costAmount;
    private String costDesc;
    private String receiptImage;
    private LocalDateTime occurredAt;
    private Long recordedBy;
    private Long verifiedBy;
    private String verifyStatus;
    private String rejectReason;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
