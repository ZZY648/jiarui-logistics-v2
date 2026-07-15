package com.jiarui.module.dispatch.controller;

import com.jiarui.common.Result;
import com.jiarui.module.dispatch.entity.Driver;
import com.jiarui.module.dispatch.entity.Vehicle;
import com.jiarui.module.dispatch.service.DispatchService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dispatch")
@RequiredArgsConstructor
public class DispatchController {

    private final DispatchService dispatchService;

    /** 为运单推荐最优车辆 */
    @GetMapping("/recommend/{waybillId}")
    public Result<List<Map<String, Object>>> recommend(@PathVariable Long waybillId) {
        return Result.success(dispatchService.recommendVehicles(waybillId));
    }

    /** 空闲车辆列表 */
    @GetMapping("/vehicles/idle")
    public Result<List<Vehicle>> listIdleVehicles() {
        return Result.success(dispatchService.listIdleVehicles());
    }

    /** 可用司机列表 */
    @GetMapping("/drivers/available")
    public Result<List<Driver>> listAvailableDrivers() {
        return Result.success(dispatchService.listAvailableDrivers());
    }

    /** 车队总览 */
    @GetMapping("/fleet/overview")
    public Result<Map<String, Object>> fleetOverview() {
        return Result.success(dispatchService.fleetOverview());
    }
}
