package com.jiarui.module.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.jiarui.module.order.entity.WaybillStop;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface WaybillStopMapper extends BaseMapper<WaybillStop> {

    @Select("SELECT * FROM waybill_stop WHERE waybill_id = #{waybillId} ORDER BY stop_seq")
    List<WaybillStop> selectByWaybillId(@Param("waybillId") Long waybillId);
}
