package com.jiarui.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jiarui.module.system.entity.SysUser;
import com.jiarui.module.system.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        // 确保系统不存在时自动创建默认用户（使用真正的 BCrypt 加密）
        createUserIfAbsent("admin",      "系统管理员", "admin",      "13800000001");
        createUserIfAbsent("dispatcher", "调度员张三", "dispatcher", "13800000002");
        createUserIfAbsent("finance",    "财务李四",   "finance",    "13800000003");
        log.info("默认用户初始化完成");
    }

    private void createUserIfAbsent(String username, String displayName, String role, String phone) {
        Long count = sysUserMapper.selectCount(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        if (count == 0) {
            SysUser user = new SysUser();
            user.setUsername(username);
            user.setPasswordHash(passwordEncoder.encode("jiarui123"));
            user.setDisplayName(displayName);
            user.setRole(role);
            user.setPhone(phone);
            user.setStatus(1);
            sysUserMapper.insert(user);
            log.info("创建默认用户: {} (密码: jiarui123)", username);
        }
    }
}
