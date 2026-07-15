package com.jiarui.module.cost.job;

import com.jiarui.module.cost.service.CostAllocationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * 间接成本分摊定时任务
 * 每月 1 日凌晨 2:00 自动录入车辆折旧、保险并分摊到当月运单
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CostAllocationJob {

    private final CostAllocationService costAllocationService;

    @Scheduled(cron = "0 0 2 1 * ?")
    public void autoAllocateFixedCosts() {
        LocalDate now = LocalDate.now();
        int year = now.getYear();
        int month = now.getMonthValue();
        try {
            costAllocationService.autoRecordFixedCosts(year, month);
            log.info("固定成本分摊完成: {}年{}月", year, month);
        } catch (Exception e) {
            log.error("固定成本分摊失败", e);
        }
    }
}
