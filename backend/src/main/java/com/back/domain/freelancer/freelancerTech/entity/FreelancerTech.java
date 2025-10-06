package com.back.domain.freelancer.freelancerTech.entity;

import com.back.domain.freelancer.freelancer.entity.Freelancer;
import com.back.domain.tech.entity.Tech;
import com.back.global.jpa.entity.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.ManyToOne;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@NoArgsConstructor
public class FreelancerTech extends BaseEntity {

    @ManyToOne
    private Freelancer freelancer;

    @ManyToOne
    private Tech tech;

    private String techLevel;

    public FreelancerTech(Freelancer freelancer, Tech tech, String techLevel) {
        this.freelancer = freelancer;
        this.tech = tech;
        this.techLevel = techLevel;
    }
}
