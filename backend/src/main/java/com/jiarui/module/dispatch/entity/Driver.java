package com.jiarui.module.dispatch.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("driver")
public class Driver {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String driverCode;
    private String name;
    private String phone;
    private String idCard;
    private String licenseType;
    private LocalDate licenseExpiry;
    private String wechatOpenid;
    private String status;
    private LocalDate hiredDate;
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
