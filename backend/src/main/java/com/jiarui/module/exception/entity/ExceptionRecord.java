package com.jiarui.module.exception.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("exception_record")
public class ExceptionRecord {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long waybillId;
    private String exceptionType;
    private String severity;
    private Long reportedBy;
    private LocalDateTime reportedAt;
    private String description;
    private String imageUrls;
    private Long handlerId;
    private String handleStatus;
    private String handleResult;
    private String handleRemark;
    private LocalDateTime slaDeadline;
    private LocalDateTime resolvedAt;
    private LocalDateTime escalatedAt;
    private Long escalatedTo;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
