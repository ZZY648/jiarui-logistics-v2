package com.jiarui.module.tracking.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jiarui.module.order.entity.Waybill;
import com.jiarui.module.order.entity.WaybillVehicle;
import com.jiarui.module.order.mapper.WaybillMapper;
import com.jiarui.module.order.mapper.WaybillVehicleMapper;
import com.jiarui.module.tracking.entity.GpsRecord;
import com.jiarui.module.tracking.mapper.GpsRecordMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * GPS 轨迹匹配定时任务
 * 每 60 秒执行一次，将未归属的 GPS 点按时间窗口匹配到对应运单
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GpsMatchJob {

    private final GpsRecordMapper gpsRecordMapper;
    private final WaybillMapper waybillMapper;
    private final WaybillVehicleMapper waybillVehicleMapper;

    @Scheduled(fixedDelay = 60000)
    public void matchGpsToWaybill() {
        // 查找所有 in_transit 状态的运单
        List<Waybill> activeWaybills = waybillMapper.selectList(
                new LambdaQueryWrapper<Waybill>().eq(Waybill::getStatus, "in_transit"));

        int matched = 0;
        for (Waybill waybill : activeWaybills) {
            if (waybill.getActualDepartTime() == null) continue;

            WaybillVehicle wv = waybillVehicleMapper.selectOne(
                    new LambdaQueryWrapper<WaybillVehicle>()
                            .eq(WaybillVehicle::getWaybillId, waybill.getId()));
            if (wv == null) continue;

            LocalDateTime endTime = waybill.getActualArriveTime() != null
                    ? waybill.getActualArriveTime() : LocalDateTime.now();

            // 将时间窗口内的未归属 GPS 点更新为该运单
            List<GpsRecord> unmatched = gpsRecordMapper.selectList(
                    new LambdaQueryWrapper<GpsRecord>()
                            .eq(GpsRecord::getVehicleId, wv.getVehicleId())
                            .isNull(GpsRecord::getWaybillId)
                            .between(GpsRecord::getDeviceTime,
                                    waybill.getActualDepartTime(), endTime));

            for (GpsRecord gps : unmatched) {
                gps.setWaybillId(waybill.getId());
                gpsRecordMapper.updateById(gps);
                matched++;
            }
        }

        if (matched > 0) {
            log.info("GPS 匹配完成: 本次匹配 {} 条记录到 {} 个活跃运单", matched, activeWaybills.size());
        }
    }
}
