package com.jiarui.module.order.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;

@Data
public class WaybillCreateRequest {

    @NotBlank(message = "货物名称不能为空")
    private String cargoName;

    private String cargoType;
    private BigDecimal cargoWeightKg;
    private BigDecimal cargoVolumeM3;
    private Integer cargoPieces;
    private String cargoRemark;

    private String timeRequirement;

    @NotNull(message = "提货站点不能为空")
    private List<StopInfo> pickupStops;

    @NotNull(message = "卸货站点不能为空")
    private List<StopInfo> deliveryStops;

    @Data
    public static class StopInfo {
        @NotNull private Long addressId;
        private String contactName;
        private String contactPhone;
        private String cargoDesc;
    }
}
