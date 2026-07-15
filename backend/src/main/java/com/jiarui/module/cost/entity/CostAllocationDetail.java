package com.jiarui.module.cost.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("cost_allocation_detail")
public class CostAllocationDetail {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long allocationId;
    private Long waybillId;
    private BigDecimal allocatedAmount;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
