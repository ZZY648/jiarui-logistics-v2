package com.jiarui.module.order.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("waybill")
public class Waybill {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String waybillNo;

    private Long customerId;

    // 货物信息
    private String cargoName;
    private String cargoType;
    private BigDecimal cargoWeightKg;
    private BigDecimal cargoVolumeM3;
    private Integer cargoPieces;
    private String cargoRemark;

    // 时间要求
    private LocalDateTime pickupTimeFrom;
    private LocalDateTime pickupTimeTo;
    private LocalDateTime deliveryTimeFrom;
    private LocalDateTime deliveryTimeTo;
    private String timeRequirement;

    // 费用
    private BigDecimal quotedFee;
    private String settlementStatus;

    // 状态
    private String status;
    private String dispatchType;

    // 运行数据
    private LocalDateTime actualDepartTime;
    private LocalDateTime actualArriveTime;
    private String signedStatus;
    private LocalDateTime signedAt;

    // 审计
    private Long createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
