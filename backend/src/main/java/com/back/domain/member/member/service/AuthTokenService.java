package com.back.domain.member.member.service;

import com.back.domain.member.member.entity.Member;
import com.back.domain.member.member.entity.Role;
import com.back.global.standard.util.JWTUt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AuthTokenService {

    @Value("${custom.jwt.secretKey}")
    private String jwtSecretKey;

    @Value("${custom.accessToken.expireSeconds}")
    private int accessTokenExpireSeconds;

    public String genAccessToken(Member member) {
        long id = member.getId();
        String username = member.getUsername();
        String nickname = member.getNickname();
        List<Role> roles = member.getRoles();

        Map<String, Object> claims = new HashMap<>();
        claims.put("id", id);
        claims.put("username", username);
        claims.put("nickname", nickname);
        claims.put("roles", roles);

        return JWTUt.jwt.toString(
                jwtSecretKey,
                accessTokenExpireSeconds,
                claims
        );
    }

    public Map<String, Object> payload(String assessToken) {
        Map<String, Object> parsedPayload = JWTUt.jwt.payload(jwtSecretKey, assessToken);

        if (parsedPayload == null) return null;

        long id = ((Number) parsedPayload.get("id")).longValue();

        String username = (String) parsedPayload.get("username");

        String nickname = (String) parsedPayload.get("nickname");

        long exp = ((Number) parsedPayload.get("exp")).longValue();

        return Map.of("id", id, "username", username, "nickname", nickname, "exp", exp );
    }
}
