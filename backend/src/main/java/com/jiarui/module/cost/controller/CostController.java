package com.jiarui.module.cost.controller;

import com.jiarui.common.Result;
import com.jiarui.module.cost.entity.CostItem;
import com.jiarui.module.cost.entity.WaybillCostSnapshot;
import com.jiarui.module.cost.service.BillingService;
import com.jiarui.module.cost.service.CostService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

@RestController
@RequestMapping("/api/cost")
@RequiredArgsConstructor
public class CostController {

    private final CostService costService;
    private final BillingService billingService;

    /** 记录直接费用（司机/财务录入） */
    @PostMapping("/item")
    public Result<CostItem> record(@RequestBody Map<String, Object> body) {
        Long waybillId = Long.valueOf(body.get("waybillId").toString());
        String costType = (String) body.get("costType");
        BigDecimal amount = new BigDecimal(body.get("amount").toString());
        String desc = (String) body.getOrDefault("desc", "");
        String receiptUrl = (String) body.getOrDefault("receiptUrl", "");
        return Result.success(costService.recordDirectCost(waybillId, costType, amount, desc, receiptUrl));
    }

    /** 财务审核费用 */
    @PostMapping("/item/{id}/verify")
    public Result<CostItem> verify(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        boolean approved = (boolean) body.get("approved");
        String reason = (String) body.getOrDefault("reason", "");
        return Result.success(costService.verifyCost(id, approved, reason));
    }

    /** 计算运单成本快照 */
    @PostMapping("/snapshot/{waybillId}")
    public Result<WaybillCostSnapshot> calculate(@PathVariable Long waybillId) {
        return Result.success(costService.calculateTripCost(waybillId));
    }

    /** 查看运单成本快照 */
    @GetMapping("/snapshot/{waybillId}")
    public Result<WaybillCostSnapshot> getSnapshot(@PathVariable Long waybillId) {
        return Result.success(costService.getSnapshot(waybillId));
    }

    /** 手动触发生成月结对账单 */
    @PostMapping("/billing/generate/{customerId}")
    public Result<?> generateBilling(@PathVariable Long customerId,
                                      @RequestParam int year,
                                      @RequestParam int month) {
        return Result.success(billingService.generateMonthlyBilling(customerId, year, month));
    }
}
