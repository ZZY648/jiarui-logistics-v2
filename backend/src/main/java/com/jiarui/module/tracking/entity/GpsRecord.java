package com.jiarui.module.tracking.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("gps_record")
public class GpsRecord {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long vehicleId;
    private Long waybillId;
    private BigDecimal longitude;
    private BigDecimal latitude;
    private BigDecimal speedKmh;
    private Integer direction;
    private LocalDateTime deviceTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
