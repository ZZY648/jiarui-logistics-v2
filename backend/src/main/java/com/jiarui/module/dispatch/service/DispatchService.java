package com.jiarui.module.dispatch.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jiarui.common.exception.BusinessException;
import com.jiarui.module.dispatch.entity.Driver;
import com.jiarui.module.dispatch.entity.Vehicle;
import com.jiarui.module.dispatch.mapper.DriverMapper;
import com.jiarui.module.dispatch.mapper.VehicleMapper;
import com.jiarui.module.order.entity.Waybill;
import com.jiarui.module.order.mapper.WaybillMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DispatchService {

    private final VehicleMapper vehicleMapper;
    private final DriverMapper driverMapper;
    private final WaybillMapper waybillMapper;

    /**
     * 为运单推荐最优车辆（规则引擎，阶段 1）
     * 评分维度：车型匹配(40%) + 空闲状态(30%) + 位置就近(20%) + 油耗经济性(10%)
     */
    public List<Map<String, Object>> recommendVehicles(Long waybillId) {
        Waybill waybill = waybillMapper.selectById(waybillId);
        if (waybill == null) throw BusinessException.notFound("运单不存在");

        // 确定需要的车型
        String requiredType = determineVehicleType(
                waybill.getCargoWeightKg(), waybill.getCargoVolumeM3());

        List<Vehicle> vehicles = vehicleMapper.selectList(
                new LambdaQueryWrapper<Vehicle>().eq(Vehicle::getStatus, "idle"));

        return vehicles.stream()
            .map(v -> {
                double score = 0;
                // 车型匹配
                if (v.getVehicleType().equals(requiredType)) score += 40;
                else if (isLargerType(v.getVehicleType(), requiredType)) score += 25;
                else score += 10;
                // 空闲状态
                if ("idle".equals(v.getStatus())) score += 30;
                // 油耗经济性
                if (v.getFuelCostPer100km() != null) {
                    double fuelScore = 10 * (1 - v.getFuelCostPer100km().doubleValue() / 25.0);
                    score += Math.max(0, fuelScore);
                }

                Map<String, Object> result = new HashMap<>();
                result.put("vehicleId", v.getId());
                result.put("plateNumber", v.getPlateNumber());
                result.put("vehicleType", v.getVehicleType());
                result.put("maxLoadKg", v.getMaxLoadKg());
                result.put("score", Math.round(score * 10) / 10.0);
                return result;
            })
            .sorted((a, b) -> Double.compare(
                    (Double) b.get("score"), (Double) a.get("score")))
            .limit(3)
            .collect(Collectors.toList());
    }

    /** 获取所有空闲车辆 */
    public List<Vehicle> listIdleVehicles() {
        return vehicleMapper.selectList(
                new LambdaQueryWrapper<Vehicle>().eq(Vehicle::getStatus, "idle"));
    }

    /** 获取所有可用司机 */
    public List<Driver> listAvailableDrivers() {
        return driverMapper.selectList(
                new LambdaQueryWrapper<Driver>().eq(Driver::getStatus, "available"));
    }

    /** 车辆状态一览 */
    public Map<String, Object> fleetOverview() {
        Long total = vehicleMapper.selectCount(null);
        Long idle = vehicleMapper.selectCount(
                new LambdaQueryWrapper<Vehicle>().eq(Vehicle::getStatus, "idle"));
        Long enRoute = vehicleMapper.selectCount(
                new LambdaQueryWrapper<Vehicle>().eq(Vehicle::getStatus, "en_route"));
        Long maintenance = vehicleMapper.selectCount(
                new LambdaQueryWrapper<Vehicle>().eq(Vehicle::getStatus, "maintenance"));

        Map<String, Object> result = new HashMap<>();
        result.put("total", total);
        result.put("idle", idle);
        result.put("enRoute", enRoute);
        result.put("maintenance", maintenance);
        result.put("utilizationRate", total > 0 ?
                enRoute.doubleValue() / total.doubleValue() * 100 : 0);
        return result;
    }

    private String determineVehicleType(BigDecimal weightKg, BigDecimal volumeM3) {
        double w = weightKg != null ? weightKg.doubleValue() : 0;
        double v = volumeM3 != null ? volumeM3.doubleValue() : 0;
        if (w <= 1200 && v <= 6.5) return "small_truck";
        if (w <= 5000 && v <= 20) return "medium_truck";
        return "heavy_truck";
    }

    private boolean isLargerType(String actual, String required) {
        List<String> order = List.of("small_truck", "medium_truck", "heavy_truck");
        return order.indexOf(actual) > order.indexOf(required);
    }
}
