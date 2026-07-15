package com.jiarui.module.dispatch.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("vehicle")
public class Vehicle {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String vehicleCode;
    private String plateNumber;
    private String vehicleType;
    private String brandModel;
    private BigDecimal maxLoadKg;
    private BigDecimal maxVolumeM3;
    private BigDecimal lengthM;
    private String gpsDeviceId;
    private String fuelType;
    private BigDecimal fuelCostPer100km;
    private BigDecimal monthlyDepreciation;
    private BigDecimal monthlyInsurance;
    private Long currentDriverId;
    private String status;
    private LocalDate purchaseDate;
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
