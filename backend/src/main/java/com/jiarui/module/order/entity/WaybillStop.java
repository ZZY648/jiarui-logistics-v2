package com.jiarui.module.order.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("waybill_stop")
public class WaybillStop {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long waybillId;
    private Integer stopSeq;
    private String stopType;
    private String companyName;
    private String contactName;
    private String contactPhone;
    private String province;
    private String city;
    private String district;
    private String addressDetail;
    private BigDecimal longitude;
    private BigDecimal latitude;
    private LocalDateTime plannedArrive;
    private LocalDateTime actualArrive;
    private String cargoDesc;
    private String status;
    private LocalDateTime signedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
