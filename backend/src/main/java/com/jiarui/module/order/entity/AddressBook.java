package com.jiarui.module.order.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("address_book")
public class AddressBook {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long customerId;
    private String addressName;
    private String contactName;
    private String contactPhone;
    private String province;
    private String city;
    private String district;
    private String addressDetail;
    private BigDecimal longitude;
    private BigDecimal latitude;
    private Boolean isDefault;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
