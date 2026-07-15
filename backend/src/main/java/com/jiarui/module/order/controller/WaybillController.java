package com.jiarui.module.order.controller;

import com.jiarui.common.Result;
import com.jiarui.module.order.dto.WaybillCreateRequest;
import com.jiarui.module.order.entity.Waybill;
import com.jiarui.module.order.service.WaybillService;
import com.jiarui.security.SecurityUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class WaybillController {

    private final WaybillService waybillService;

    // ==================== 客户端 (小程序) ====================
    @PostMapping("/api/wx/waybill")
    public Result<Waybill> create(@Valid @RequestBody WaybillCreateRequest request) {
        return Result.success(waybillService.create(SecurityUtil.getCurrentUserId(), request));
    }

    @GetMapping("/api/wx/waybill")
    public Result<List<Waybill>> listByCustomer() {
        return Result.success(waybillService.listByCustomer(SecurityUtil.getCurrentUserId()));
    }

    @GetMapping("/api/wx/waybill/{id}")
    public Result<Waybill> detail(@PathVariable Long id) {
        return Result.success(waybillService.getDetail(id));
    }

    @GetMapping("/api/wx/track/{waybillNo}")
    public Result<?> track(@PathVariable String waybillNo) {
        return Result.success(waybillService.getTrackInfo(waybillNo));
    }

    @PostMapping("/api/wx/waybill/{id}/cancel")
    public Result<Void> cancel(@PathVariable Long id) {
        waybillService.cancelOrder(id);
        return Result.success();
    }

    // ==================== 管理后台 (Web) ====================
    @GetMapping("/api/admin/waybill/pending")
    public Result<List<Waybill>> listPending() {
        return Result.success(waybillService.listPendingDispatch());
    }

    @GetMapping("/api/admin/waybill/in-transit")
    public Result<List<Waybill>> listInTransit() {
        return Result.success(waybillService.listInTransit());
    }

    @PostMapping("/api/admin/waybill/{id}/schedule")
    public Result<Waybill> schedule(@PathVariable Long id,
                                     @RequestParam Long vehicleId,
                                     @RequestParam Long driverId) {
        return Result.success(waybillService.schedule(id, vehicleId, driverId));
    }

    @PostMapping("/api/admin/waybill/{id}/exception")
    public Result<Waybill> markException(@PathVariable Long id, @RequestParam String reason) {
        return Result.success(waybillService.markException(id, reason));
    }

    // ==================== 司机端 (小程序) ====================
    @PostMapping("/api/driver/waybill/{id}/load")
    public Result<Waybill> load(@PathVariable Long id) {
        return Result.success(waybillService.load(id));
    }

    @PostMapping("/api/driver/waybill/{id}/depart")
    public Result<Waybill> depart(@PathVariable Long id) {
        return Result.success(waybillService.depart(id));
    }

    @PostMapping("/api/driver/waybill/{id}/arrive")
    public Result<Waybill> arrive(@PathVariable Long id) {
        return Result.success(waybillService.arrive(id));
    }

    @PostMapping("/api/driver/waybill/{id}/sign")
    public Result<Waybill> sign(@PathVariable Long id) {
        return Result.success(waybillService.sign(id));
    }
}
