package com.jiarui.module.order.service;

import com.jiarui.module.order.dto.WaybillCreateRequest;
import com.jiarui.module.order.entity.Waybill;

import java.util.List;

public interface WaybillService {

    // 创建
    Waybill create(Long customerId, WaybillCreateRequest request);

    // 状态流转
    Waybill schedule(Long id, Long vehicleId, Long driverId);
    Waybill load(Long id);
    Waybill depart(Long id);
    Waybill arrive(Long id);
    Waybill sign(Long id);
    Waybill markException(Long id, String reason);
    void cancelOrder(Long id);

    // 查询
    List<Waybill> listByCustomer(Long customerId);
    Waybill getDetail(Long id);
    Object getTrackInfo(String waybillNo);
    List<Waybill> listPendingDispatch();
    List<Waybill> listInTransit();
}
