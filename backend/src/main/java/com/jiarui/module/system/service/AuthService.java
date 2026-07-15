package com.jiarui.module.system.service;

import com.jiarui.common.exception.BusinessException;
import com.jiarui.module.system.dto.LoginRequest;
import com.jiarui.module.system.dto.LoginResponse;
import com.jiarui.module.system.entity.SysUser;
import com.jiarui.module.system.mapper.SysUserMapper;
import com.jiarui.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    public LoginResponse login(LoginRequest request) {
        SysUser user = sysUserMapper.selectByUsername(request.getUsername());
        if (user == null) {
            throw BusinessException.unauthorized("用户名或密码错误");
        }
        if (user.getStatus() == 0) {
            throw BusinessException.forbidden("账号已被禁用");
        }
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw BusinessException.unauthorized("用户名或密码错误");
        }

        // 更新最后登录时间
        SysUser updateLogin = new SysUser();
        updateLogin.setId(user.getId());
        updateLogin.setLastLoginAt(java.time.LocalDateTime.now());
        sysUserMapper.updateById(updateLogin);

        String accessToken = jwtTokenProvider.generateToken(
                user.getId(), user.getUsername(), user.getRole());
        String refreshToken = jwtTokenProvider.generateRefreshToken(
                user.getId(), user.getUsername());

        return LoginResponse.builder()
                .userId(user.getId())
                .username(user.getUsername())
                .displayName(user.getDisplayName())
                .role(user.getRole())
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .expiresIn(86400000L)
                .build();
    }

    public LoginResponse refresh(String token) {
        if (!jwtTokenProvider.validateToken(token)) {
            throw BusinessException.unauthorized("refresh token无效或已过期");
        }
        Long userId = jwtTokenProvider.getUserIdFromToken(token);
        String username = jwtTokenProvider.getUsernameFromToken(token);
        String role = jwtTokenProvider.getRoleFromToken(token);

        String newAccessToken = jwtTokenProvider.generateToken(userId, username, role);
        String newRefreshToken = jwtTokenProvider.generateRefreshToken(userId, username);

        return LoginResponse.builder()
                .userId(userId)
                .username(username)
                .role(role)
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .expiresIn(86400000L)
                .build();
    }
}
