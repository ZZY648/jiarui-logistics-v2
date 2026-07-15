package com.jiarui.module.sign.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("sign_record")
public class SignRecord {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long waybillId;
    private Long waybillStopId;
    private String signType;
    private String signName;
    private String signPhone;
    private String signImageUrl;
    private BigDecimal signLongitude;
    private BigDecimal signLatitude;
    private String remark;
    private LocalDateTime signedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
