package com.jiarui.module.system.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginResponse {

    private Long userId;
    private String username;
    private String displayName;
    private String role;
    private String accessToken;
    private String refreshToken;
    private Long expiresIn;
}
