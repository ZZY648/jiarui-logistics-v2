package com.jiarui.module.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.jiarui.module.order.entity.Waybill;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface WaybillMapper extends BaseMapper<Waybill> {

    @Select("SELECT * FROM waybill WHERE customer_id = #{customerId} ORDER BY created_at DESC")
    List<Waybill> selectByCustomerId(@Param("customerId") Long customerId);

    @Select("SELECT * FROM waybill WHERE status = #{status} ORDER BY created_at DESC")
    List<Waybill> selectByStatus(@Param("status") String status);
}
