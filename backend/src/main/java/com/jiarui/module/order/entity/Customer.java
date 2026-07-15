package com.jiarui.module.order.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("customer")
public class Customer {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String customerCode;
    private String companyName;
    private String shortName;
    private String contactName;
    private String contactPhone;
    private String province;
    private String city;
    private String district;
    private String addressDetail;
    private String settlementType;
    private BigDecimal creditLimit;
    private String taxId;
    private BigDecimal discountRate;
    private Integer status;
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
