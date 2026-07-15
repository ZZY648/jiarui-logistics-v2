package com.jiarui.module.order.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("waybill_vehicle")
public class WaybillVehicle {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long waybillId;
    private Long vehicleId;
    private Long driverId;
    private LocalDateTime assignedAt;
}
