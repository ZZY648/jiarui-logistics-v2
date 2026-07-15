package com.jiarui.module.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.jiarui.module.order.entity.AddressBook;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface AddressBookMapper extends BaseMapper<AddressBook> {

    @Select("SELECT * FROM address_book WHERE customer_id = #{customerId} ORDER BY is_default DESC, created_at DESC")
    List<AddressBook> selectByCustomerId(@Param("customerId") Long customerId);
}
