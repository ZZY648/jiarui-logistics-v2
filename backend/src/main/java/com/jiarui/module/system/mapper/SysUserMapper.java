package com.jiarui.module.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.jiarui.module.system.entity.SysUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface SysUserMapper extends BaseMapper<SysUser> {

    @Select("SELECT * FROM sys_user WHERE username = #{username} AND status = 1")
    SysUser selectByUsername(String username);
}
