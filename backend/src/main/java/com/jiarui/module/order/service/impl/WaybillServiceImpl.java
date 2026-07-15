package com.jiarui.module.order.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.jiarui.common.exception.BusinessException;
import com.jiarui.module.order.dto.WaybillCreateRequest;
import com.jiarui.module.order.entity.AddressBook;
import com.jiarui.module.order.entity.Waybill;
import com.jiarui.module.order.entity.WaybillStop;
import com.jiarui.module.order.entity.WaybillVehicle;
import com.jiarui.module.order.mapper.AddressBookMapper;
import com.jiarui.module.order.mapper.WaybillMapper;
import com.jiarui.module.order.mapper.WaybillStopMapper;
import com.jiarui.module.order.mapper.WaybillVehicleMapper;
import com.jiarui.module.order.service.WaybillService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@RequiredArgsConstructor
public class WaybillServiceImpl extends ServiceImpl<WaybillMapper, Waybill>
        implements WaybillService {

    private final WaybillMapper waybillMapper;
    private final WaybillStopMapper waybillStopMapper;
    private final WaybillVehicleMapper waybillVehicleMapper;
    private final AddressBookMapper addressBookMapper;

    // ==================== 状态流转规则 ====================
    private static final Map<String, List<String>> ALLOWED_TRANSITIONS = Map.of(
        "draft",      List.of("confirmed", "cancelled"),
        "confirmed",  List.of("scheduled", "cancelled"),
        "scheduled",  List.of("loaded", "exception", "cancelled"),
        "loaded",     List.of("in_transit", "exception"),
        "in_transit", List.of("arrived", "exception"),
        "arrived",    List.of("signed", "exception"),
        "signed",     List.of("completed"),
        "exception",  List.of("scheduled", "loaded", "in_transit", "arrived", "completed")
    );

    // ==================== 创建运单（站点的地址信息从 address_book 自动填充） ====================
    @Override
    @Transactional
    public Waybill create(Long customerId, WaybillCreateRequest request) {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Long todayCount = baseMapper.selectCount(
            new LambdaQueryWrapper<Waybill>().ge(Waybill::getCreatedAt, LocalDate.now().atStartOfDay()));
        String waybillNo = String.format("YD%s%04d", today, (todayCount + 1));

        Waybill waybill = new Waybill();
        waybill.setWaybillNo(waybillNo);
        waybill.setCustomerId(customerId);
        waybill.setCargoName(request.getCargoName());
        waybill.setCargoType(Optional.ofNullable(request.getCargoType()).orElse("general"));
        waybill.setCargoWeightKg(request.getCargoWeightKg());
        waybill.setCargoVolumeM3(request.getCargoVolumeM3());
        waybill.setCargoPieces(request.getCargoPieces());
        waybill.setCargoRemark(request.getCargoRemark());
        waybill.setTimeRequirement(
                Optional.ofNullable(request.getTimeRequirement()).orElse("normal"));
        waybill.setQuotedFee(calculateQuote(request));
        waybill.setStatus("confirmed");
        waybill.setDispatchType("full_load");
        waybill.setSettlementStatus("pending");
        waybill.setSignedStatus("unsigned");
        baseMapper.insert(waybill);

        // 创建站点：从 address_book 读取地址详情自动填充
        int seq = 1;
        if (request.getPickupStops() != null) {
            for (WaybillCreateRequest.StopInfo si : request.getPickupStops()) {
                waybillStopMapper.insert(buildStop(waybill.getId(), seq++, "pickup", si));
            }
        }
        if (request.getDeliveryStops() != null) {
            for (WaybillCreateRequest.StopInfo si : request.getDeliveryStops()) {
                waybillStopMapper.insert(buildStop(waybill.getId(), seq++, "delivery", si));
            }
        }
        return waybill;
    }

    private BigDecimal calculateQuote(WaybillCreateRequest req) {
        double distance = 100.0;  // TODO: 对接腾讯地图 API 算真实里程
        double weight = req.getCargoWeightKg() != null ? req.getCargoWeightKg().doubleValue() : 0;
        double fee = 120.0 + 5.0 * distance + 0.15 * weight;
        return BigDecimal.valueOf(Math.max(fee, 200.0));
    }

    // ==================== 状态流转 ====================
    @Override
    @Transactional
    public Waybill schedule(Long id, Long vehicleId, Long driverId) {
        Waybill waybill = transition(id, "scheduled");

        // 写入运单-车辆关联记录（拼车场景下同一车辆可关联多个运单）
        WaybillVehicle wv = new WaybillVehicle();
        wv.setWaybillId(id);
        wv.setVehicleId(vehicleId);
        wv.setDriverId(driverId);
        wv.setAssignedAt(LocalDateTime.now());
        waybillVehicleMapper.insert(wv);

        return waybill;
    }

    @Override
    @Transactional
    public Waybill load(Long id) {
        return transition(id, "loaded");
    }

    @Override
    @Transactional
    public Waybill depart(Long id) {
        Waybill waybill = transition(id, "in_transit");
        waybill.setActualDepartTime(LocalDateTime.now());
        baseMapper.updateById(waybill);
        return waybill;
    }

    @Override
    @Transactional
    public Waybill arrive(Long id) {
        Waybill waybill = transition(id, "arrived");
        waybill.setActualArriveTime(LocalDateTime.now());
        baseMapper.updateById(waybill);
        return waybill;
    }

    @Override
    @Transactional
    public Waybill sign(Long id) {
        Waybill waybill = transition(id, "signed");
        waybill.setSignedAt(LocalDateTime.now());
        waybill.setSignedStatus("full");
        baseMapper.updateById(waybill);
        return waybill;
    }

    @Override
    @Transactional
    public Waybill markException(Long id, String reason) {
        transition(id, "exception");
        return baseMapper.selectById(id);
    }

    @Override
    @Transactional
    public void cancelOrder(Long id) {
        Waybill waybill = getOrThrow(id);
        validateTransition(waybill.getStatus(), "cancelled");
        waybill.setStatus("cancelled");
        baseMapper.updateById(waybill);
    }

    // ==================== 查询 ====================
    @Override
    public List<Waybill> listByCustomer(Long customerId) {
        return waybillMapper.selectByCustomerId(customerId);
    }

    @Override
    public Waybill getDetail(Long id) {
        return getOrThrow(id);
    }

    @Override
    public Object getTrackInfo(String waybillNo) {
        Waybill waybill = baseMapper.selectOne(
            new LambdaQueryWrapper<Waybill>().eq(Waybill::getWaybillNo, waybillNo));
        if (waybill == null) throw BusinessException.notFound("运单不存在");

        List<WaybillStop> stops = waybillStopMapper.selectByWaybillId(waybill.getId());
        Map<String, Object> result = new HashMap<>();
        result.put("waybill", waybill);
        result.put("stops", stops);
        result.put("currentStatus", waybill.getStatus());
        return result;
    }

    public List<Waybill> listPendingDispatch() {
        return waybillMapper.selectByStatus("confirmed");
    }

    public List<Waybill> listInTransit() {
        return waybillMapper.selectByStatus("in_transit");
    }

    public List<WaybillStop> getStops(Long waybillId) {
        return waybillStopMapper.selectByWaybillId(waybillId);
    }

    // ==================== 内部工具 ====================
    private Waybill transition(Long id, String targetStatus) {
        Waybill waybill = getOrThrow(id);
        validateTransition(waybill.getStatus(), targetStatus);
        waybill.setStatus(targetStatus);
        baseMapper.updateById(waybill);
        return waybill;
    }

    private void validateTransition(String from, String to) {
        List<String> allowed = ALLOWED_TRANSITIONS.get(from);
        if (allowed == null || !allowed.contains(to)) {
            throw BusinessException.badRequest(
                String.format("不允许从 '%s' 变更为 '%s'", from, to));
        }
    }

    private Waybill getOrThrow(Long id) {
        Waybill waybill = baseMapper.selectById(id);
        if (waybill == null) throw BusinessException.notFound("运单不存在");
        return waybill;
    }

    /** 从 address_book 读取地址详情，自动填充站点 */
    private WaybillStop buildStop(Long waybillId, int seq, String type,
                                   WaybillCreateRequest.StopInfo info) {
        WaybillStop stop = new WaybillStop();
        stop.setWaybillId(waybillId);
        stop.setStopSeq(seq);
        stop.setStopType(type);
        stop.setCargoDesc(info.getCargoDesc());
        stop.setStatus("pending");

        // 如果传了 addressId，从地址库读取填充
        if (info.getAddressId() != null) {
            AddressBook addr = addressBookMapper.selectById(info.getAddressId());
            if (addr != null) {
                stop.setCompanyName(addr.getAddressName());
                stop.setContactName(
                        info.getContactName() != null ? info.getContactName() : addr.getContactName());
                stop.setContactPhone(
                        info.getContactPhone() != null ? info.getContactPhone() : addr.getContactPhone());
                stop.setProvince(addr.getProvince());
                stop.setCity(addr.getCity());
                stop.setDistrict(addr.getDistrict());
                stop.setAddressDetail(addr.getAddressDetail());
                stop.setLongitude(addr.getLongitude());
                stop.setLatitude(addr.getLatitude());
                return stop;
            }
        }
        // 兜底：用请求里传的字段
        stop.setContactName(info.getContactName());
        stop.setContactPhone(info.getContactPhone());
        return stop;
    }
}
