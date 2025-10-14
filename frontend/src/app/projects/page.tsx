"use client";

import { useUser } from '@/app/context/UserContext';
import FavoriteButton from '@/components/FavoriteButton';
import LoadingSpinner from '@/components/LoadingSpinner';
import { components } from '@/lib/backend/schema';
import { getUserFavoriteProjectIds, sortProjectsByFavorite } from '@/utils/favoriteUtils';
import {
  calculateDday,
  getBudgetTypeText,
  getLocationCodeFromText,
  getLocationText,
  getProjectFieldText,
  getRecruitmentTypeText,
  getStatusText
} from '@/utils/projectUtils';
import { sessionStorageUtils } from '@/utils/sessionStorageUtils';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type ProjectResponse = components['schemas']['ProjectResponse'];
type PageProjectResponse = components['schemas']['PageProjectResponse'];

const ProjectsPage = () => {
  const router = useRouter();
  const { username, memberId, isLoaded } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLocationExpanded, setIsLocationExpanded] = useState(false);
  const [isBudgetExpanded, setIsBudgetExpanded] = useState(false);
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<number[]>([]);
  const [sortByFavorite, setSortByFavorite] = useState(false);
  const [filters, setFilters] = useState({
    projectField: '',
    recruitmentType: '',
    status: 'RECRUITING', // 기본적으로 모집중 프로젝트만 노출
    location: '',
    budgetRange: ''
  });

  // 사용자 인증 시스템과 연동 - UserContext에서 사용자 정보 가져오기
  const getCurrentUserId = () => {
    // UserContext에서 사용자 정보를 확인
    // 인증된 사용자의 경우 실제 사용자 ID를 반환하고, 
    // 비인증 사용자의 경우 null을 반환하여 즐겨찾기 기능을 비활성화
    if (username && isLoaded && memberId) {
      return memberId;
    }
    return null;
  };

  // 사용자 인증 상태 확인
  const isAuthenticated = () => {
    return username !== null && isLoaded;
  };

  // 즐겨찾기 목록 로드 - 인증된 사용자만
  useEffect(() => {
    // UserContext 로딩이 완료된 후에만 실행
    if (!isLoaded) return;

    const loadFavorites = async () => {
      // 인증된 사용자인 경우에만 즐겨찾기 로드
      if (!isAuthenticated()) {
        setFavoriteProjectIds([]);
        // 즐겨찾기 정렬도 해제
        setSortByFavorite(false);
        return;
      }

      try {
        const userId = getCurrentUserId();
        if (userId === null) {
          setFavoriteProjectIds([]);
          setSortByFavorite(false);
          return;
        }

        // 항상 서버에서 최신 즐겨찾기 목록을 가져와서 baseinitdata와 동기화 보장
        const favoriteIds = await getUserFavoriteProjectIds(userId);
        setFavoriteProjectIds(favoriteIds);
        
        // sessionStorage에 저장 (페이지 간 동기화용)
        sessionStorageUtils.setFavoriteList(userId, favoriteIds);
      } catch (error) {
        console.error('즐겨찾기 목록 로드 실패:', error);
        setFavoriteProjectIds([]);
        setSortByFavorite(false);
      }
    };

    loadFavorites();
  }, [username, isLoaded]); // username과 isLoaded 상태 변화에 따라 재실행

  // 즐겨찾기 상태 변경 이벤트 리스너
  useEffect(() => {
    const handleFavoriteChange = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { projectId, isFavorite } = customEvent.detail;
      
      // 서버에서 최신 즐겨찾기 목록을 다시 로드
      const userId = getCurrentUserId();
      if (userId !== null && isAuthenticated()) {
        try {
          // 서버에서 최신 즐겨찾기 목록 가져오기
          const favoriteIds = await getUserFavoriteProjectIds(userId);
          setFavoriteProjectIds(favoriteIds);
          
          // sessionStorage 업데이트 (캐시 갱신)
          sessionStorageUtils.setFavoriteList(userId, favoriteIds);
        } catch (error) {
          console.error('즐겨찾기 목록 갱신 실패:', error);
          
          // 서버 요청 실패 시 로컬 상태만 업데이트
          setFavoriteProjectIds(prev => {
            let newIds: number[];
            if (isFavorite) {
              newIds = prev.includes(projectId) ? prev : [...prev, projectId];
            } else {
              newIds = prev.filter(id => id !== projectId);
            }
            
            // sessionStorage 업데이트
            if (userId !== null) {
              sessionStorageUtils.setFavoriteList(userId, newIds);
            }
            
            return newIds;
          });
        }
      }
    };

    window.addEventListener('favoriteStatusChanged', handleFavoriteChange);
    
    return () => {
      window.removeEventListener('favoriteStatusChanged', handleFavoriteChange);
    };
  }, []);

  // 데이터 로드 및 필터 변경 처리
  useEffect(() => {
    // UserContext가 로딩 중이면 대기
    if (!isLoaded) return;

    const fetchProjects = async (page = 0, search = '', currentFilters = filters) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          size: '10',
          ...(search && { search }),
          ...(currentFilters.projectField && { projectField: currentFilters.projectField }),
          ...(currentFilters.recruitmentType && { recruitmentType: currentFilters.recruitmentType }),
          ...(currentFilters.location && { location: getLocationCodeFromText(currentFilters.location) }),
          ...(currentFilters.budgetRange && { budgetType: currentFilters.budgetRange })
        });

        // 상태 필터 처리
        if (currentFilters.status) {
          params.append('status', currentFilters.status);
        }      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/projects?${params}`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        if (response.ok) {
          const responseText = await response.text();
          
          let data: PageProjectResponse;
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            console.error('프로젝트 목록 JSON 파싱 실패:', parseError);
            throw new Error('서버 응답을 처리할 수 없습니다.');
          }
          let projectList = data.content || [];
          
          // 즐겨찾기 순으로 정렬이 활성화된 경우 (로그인된 사용자만)
          if (sortByFavorite && projectList.length > 0 && isAuthenticated()) {
            const validProjects = projectList.filter((p): p is ProjectResponse & { id: number } => 
              typeof p.id === 'number'
            );
            projectList = sortProjectsByFavorite(validProjects, favoriteProjectIds);
          }
          
          setProjects(projectList);
          setTotalPages(data.totalPages || 0);
          setCurrentPage(data.number || 0);
        }
      } catch (error) {
        console.error('프로젝트 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    setCurrentPage(0);
    fetchProjects(0, searchQuery, filters);
  }, [filters, searchQuery, sortByFavorite, favoriteProjectIds, isLoaded]);

  // 필터나 검색어 변경 시에만 스크롤 (즐겨찾기 정렬 제외)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [filters, searchQuery]);

  // 외부에서 호출 가능한 fetchProjects 함수
  const fetchProjects = async (page = 0, search = searchQuery, currentFilters = filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        size: '10',
        ...(search && { search }),
        ...(currentFilters.projectField && { projectField: currentFilters.projectField }),
        ...(currentFilters.recruitmentType && { recruitmentType: currentFilters.recruitmentType }),
        ...(currentFilters.location && { location: getLocationCodeFromText(currentFilters.location) }),
        ...(currentFilters.budgetRange && { budgetType: currentFilters.budgetRange })
      });

      // 상태 필터 처리
      if (currentFilters.status) {
        params.append('status', currentFilters.status);
      }



      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/projects?${params}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        const data: PageProjectResponse = await response.json();
        let projectList = data.content || [];
        
        // 즐겨찾기 순으로 정렬이 활성화된 경우 (로그인된 사용자만)
        if (sortByFavorite && projectList.length > 0 && isAuthenticated()) {
          const validProjects = projectList.filter((p): p is ProjectResponse & { id: number } => 
            typeof p.id === 'number'
          );
          projectList = sortProjectsByFavorite(validProjects, favoriteProjectIds);
        }
        
        setProjects(projectList);
        setTotalPages(data.totalPages || 0);
        setCurrentPage(data.number || 0);
      }
    } catch (error) {
      console.error('프로젝트 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchProjects(0, searchQuery, filters);
  };

  const handleFilterChange = (filterType: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  // 페이지 visibility 변경 시 즐겨찾기 상태 갱신 (탭 전환, 뒤로가기 등)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isLoaded && isAuthenticated()) {
        const userId = getCurrentUserId();
        if (userId !== null) {
          try {
            // 서버에서 최신 즐겨찾기 목록 가져오기
            const favoriteIds = await getUserFavoriteProjectIds(userId);
            setFavoriteProjectIds(favoriteIds);
            
            // sessionStorage 업데이트
            sessionStorageUtils.setFavoriteList(userId, favoriteIds);
          } catch (error) {
            console.error('페이지 재활성화 시 즐겨찾기 목록 갱신 실패:', error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className="bg-gray-100 min-h-screen" style={{ backgroundColor: "var(--background)" }}>
      <main className="container mx-auto px-4 py-8" style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
        <h2 className="text-xl font-bold text-gray-800 mb-4" style={{ fontSize: '24px', fontWeight: 'bold', color: '#374151', marginBottom: '16px' }}>프로젝트를 찾아보세요.</h2>
        <div className="flex space-x-8" style={{ display: 'flex', gap: '32px' }}>
          <aside className="w-1/4 bg-white shadow-md rounded-lg p-4" style={{ width: '25%', backgroundColor: 'white', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', borderRadius: '8px', padding: '16px' }}>
            <div className="flex items-center justify-between mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 className="text-lg font-bold text-gray-800" style={{ fontSize: '18px', fontWeight: 'bold', color: '#374151' }}>프로젝트 필터</h3>
              <button
                onClick={() => {
                  if (!isAuthenticated()) {
                    alert('로그인이 필요한 기능입니다.');
                    router.push('/members/login');
                    return;
                  }
                  setSortByFavorite(!sortByFavorite);
                }}
                className="p-1 transition-all duration-200 hover:scale-110 cursor-pointer"
                style={{
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  boxShadow: 'none'
                }}
                title={sortByFavorite ? '좋아요 정렬 해제' : '좋아요 순으로 정렬'}
              >
                <span className="text-20xl transition-all duration-200">
                  {sortByFavorite ? '❤️' : '🤍'}
                </span>
              </button>
            </div>
            
            {/* 프로젝트 분야 필터 */}
            <div className="mb-4" style={{ marginBottom: '16px' }}>
              <h4 className="font-semibold text-gray-700 mb-2" style={{ fontWeight: '600', color: '#374151', marginBottom: '8px' }}>프로젝트 분야</h4>
              <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="projectField" 
                    value=""
                    checked={filters.projectField === ''}
                    onChange={(e) => handleFilterChange('projectField', e.target.value)}
                  />
                  <span>전체</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="projectField" 
                    value="PLANNING"
                    checked={filters.projectField === 'PLANNING'}
                    onChange={(e) => handleFilterChange('projectField', e.target.value)}
                  />
                  <span>기획</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="projectField" 
                    value="DESIGN"
                    checked={filters.projectField === 'DESIGN'}
                    onChange={(e) => handleFilterChange('projectField', e.target.value)}
                  />
                  <span>디자인</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="projectField" 
                    value="DEVELOPMENT"
                    checked={filters.projectField === 'DEVELOPMENT'}
                    onChange={(e) => handleFilterChange('projectField', e.target.value)}
                  />
                  <span>개발</span>
                </label>
              </div>
            </div>

            {/* 모집 형태 필터 */}
            <div className="mb-4" style={{ marginBottom: '16px' }}>
              <h4 className="font-semibold text-gray-700 mb-2" style={{ fontWeight: '600', color: '#374151', marginBottom: '8px' }}>모집 형태</h4>
              <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="recruitmentType" 
                    value=""
                    checked={filters.recruitmentType === ''}
                    onChange={(e) => handleFilterChange('recruitmentType', e.target.value)}
                  />
                  <span>전체</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="recruitmentType" 
                    value="PROJECT_CONTRACT"
                    checked={filters.recruitmentType === 'PROJECT_CONTRACT'}
                    onChange={(e) => handleFilterChange('recruitmentType', e.target.value)}
                  />
                  <span>외주</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="recruitmentType" 
                    value="PERSONAL_CONTRACT"
                    checked={filters.recruitmentType === 'PERSONAL_CONTRACT'}
                    onChange={(e) => handleFilterChange('recruitmentType', e.target.value)}
                  />
                  <span>상주</span>
                </label>
              </div>
            </div>

            {/* 프로젝트 상태 필터 */}
            <div className="mb-4" style={{ marginBottom: '16px' }}>
              <h4 className="font-semibold text-gray-700 mb-2" style={{ fontWeight: '600', color: '#374151', marginBottom: '8px' }}>상태</h4>
              <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="status" 
                    value=""
                    checked={filters.status === ''}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  />
                  <span>전체</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="status" 
                    value="RECRUITING"
                    checked={filters.status === 'RECRUITING'}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  />
                  <span>모집중</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="status" 
                    value="CONTRACTING"
                    checked={filters.status === 'CONTRACTING'}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  />
                  <span>계약중</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="status" 
                    value="IN_PROGRESS"
                    checked={filters.status === 'IN_PROGRESS'}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  />
                  <span>진행중</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="status" 
                    value="COMPLETED"
                    checked={filters.status === 'COMPLETED'}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  />
                  <span>완료</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="status" 
                    value="SUSPENDED"
                    checked={filters.status === 'SUSPENDED'}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  />
                  <span>보류</span>
                </label>
                <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="status" 
                    value="CANCELLED"
                    checked={filters.status === 'CANCELLED'}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  />
                  <span>취소</span>
                </label>
              </div>
            </div>

            {/* 지역 필터 */}
            <div className="mb-4" style={{ marginBottom: '16px' }}>
              <div 
                className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded transition-colors"
                style={{ padding: '8px 12px', margin: '-8px -12px 8px -12px' }}
                onClick={() => setIsLocationExpanded(!isLocationExpanded)}
              >
                <h4 className="font-semibold text-gray-700 mb-2" style={{ margin: '0', color: '#374151' }}>지역</h4>
                <span 
                  className={`text-xs text-gray-400 transition-transform select-none ${isLocationExpanded ? 'rotate-180' : ''}`}
                  style={{ fontSize: '10px' }}
                >
                  ▼
                </span>
              </div>
              {isLocationExpanded && (
                <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value=""
                      checked={filters.location === ''}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>전체</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="서울"
                      checked={filters.location === '서울'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>서울</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="경기"
                      checked={filters.location === '경기'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>경기</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="인천"
                      checked={filters.location === '인천'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>인천</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="강원"
                      checked={filters.location === '강원'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>강원</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="충남"
                      checked={filters.location === '충남'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>충남</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="대전"
                      checked={filters.location === '대전'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>대전</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="충북"
                      checked={filters.location === '충북'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>충북</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="세종"
                      checked={filters.location === '세종'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>세종</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="부산"
                      checked={filters.location === '부산'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>부산</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="울산"
                      checked={filters.location === '울산'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>울산</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="대구"
                      checked={filters.location === '대구'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>대구</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="경북"
                      checked={filters.location === '경북'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>경북</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="경남"
                      checked={filters.location === '경남'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>경남</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="전남"
                      checked={filters.location === '전남'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>전남</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="광주"
                      checked={filters.location === '광주'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>광주</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="전북"
                      checked={filters.location === '전북'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>전북</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="제주"
                      checked={filters.location === '제주'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>제주</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="location" 
                      value="국외"
                      checked={filters.location === '국외'}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                    />
                    <span>국외</span>
                  </label>
                </div>
              )}
            </div>

            {/* 예산범위 필터 */}
            <div className="mb-4" style={{ marginBottom: '16px' }}>
              <div 
                className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded transition-colors"
                style={{ padding: '8px 12px', margin: '-8px -12px 8px -12px' }}
                onClick={() => setIsBudgetExpanded(!isBudgetExpanded)}
              >
                <h4 className="font-semibold text-gray-700 mb-2" style={{ margin: '0', color: '#374151' }}>예산범위</h4>
                <span 
                  className={`text-xs text-gray-400 transition-transform select-none ${isBudgetExpanded ? 'rotate-180' : ''}`}
                  style={{ fontSize: '10px' }}
                >
                  ▼
                </span>
              </div>
              {isBudgetExpanded && (
                <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value=""
                      checked={filters.budgetRange === ''}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>전체</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value="RANGE_1_100"
                      checked={filters.budgetRange === 'RANGE_1_100'}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>1만원 ~ 100만원</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value="RANGE_100_200"
                      checked={filters.budgetRange === 'RANGE_100_200'}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>100만원 ~ 200만원</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value="RANGE_200_300"
                      checked={filters.budgetRange === 'RANGE_200_300'}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>200만원 ~ 300만원</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value="RANGE_300_500"
                      checked={filters.budgetRange === 'RANGE_300_500'}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>300만원 ~ 500만원</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value="RANGE_500_1000"
                      checked={filters.budgetRange === 'RANGE_500_1000'}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>500만원 ~ 1000만원</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value="RANGE_1000_2000"
                      checked={filters.budgetRange === 'RANGE_1000_2000'}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>1000만원 ~ 2000만원</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value="RANGE_2000_3000"
                      checked={filters.budgetRange === 'RANGE_2000_3000'}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>2000만원 ~ 3000만원</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value="RANGE_3000_5000"
                      checked={filters.budgetRange === 'RANGE_3000_5000'}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>3000만원 ~ 5000만원</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value="RANGE_5000_OVER"
                      checked={filters.budgetRange === 'RANGE_5000_OVER'}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>5000만원 ~ 1억</span>
                  </label>
                  <label className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="budgetRange" 
                      value="OVER_1_EUK"
                      checked={filters.budgetRange === 'OVER_1_EUK'}
                      onChange={(e) => handleFilterChange('budgetRange', e.target.value)}
                    />
                    <span>1억 이상</span>
                  </label>
                </div>
              )}
            </div>
          </aside>

          <section className="w-3/4" style={{ width: '75%' }}>
            {/* 검색창 */}
            <div className="bg-white shadow-md rounded-lg p-4 mb-4" style={{ backgroundColor: 'white', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <div className="flex items-center space-x-4" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <input
                  type="text"
                  className="flex-1 border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '4px', padding: '8px 16px', outline: 'none' }}
                  placeholder="프로젝트 검색어를 입력해주세요."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button
                  className="bg-orange-500 text-white px-6 py-2 rounded hover:bg-orange-600 transition-colors"
                  style={{ backgroundColor: '#f97316', color: 'white', padding: '8px 24px', borderRadius: '4px', border: 'none', cursor: 'pointer', transition: 'background-color 0.2s' }}
                  onMouseOver={(e) => (e.target as HTMLButtonElement).style.backgroundColor = '#ea580c'}
                  onMouseOut={(e) => (e.target as HTMLButtonElement).style.backgroundColor = '#f97316'}
                  onClick={handleSearch}
                >
                  검색
                </button>
              </div>
            </div>

            {/* 로딩 상태 */}
            {loading && (
              <LoadingSpinner message="프로젝트를 불러오는 중..." />
            )}

            {/* 프로젝트 목록 */}
            {!loading && projects.length === 0 && (
              <div className="bg-white shadow-md rounded-lg p-8 text-center">
                <div className="text-gray-600">검색 결과가 없습니다.</div>
              </div>
            )}

            {!loading && projects.map((project) => (
              <div 
                key={project.id} 
                className="relative bg-white shadow-md rounded-lg p-6 mb-4 hover:shadow-lg transition-shadow" 
                style={{ position: 'relative', backgroundColor: 'white', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', borderRadius: '8px', padding: '24px', marginBottom: '16px', cursor: 'pointer', transition: 'box-shadow 0.3s' }}
                onClick={() => {
                  router.push(`/projects/${project.id}`);
                }}
              >
                <div className="flex justify-between items-start mb-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h3 className="text-lg font-bold text-gray-800 mb-2" style={{ fontSize: '18px', fontWeight: 'bold', color: '#374151', marginBottom: '8px' }}>{project.title}</h3>
                  <div className="flex items-center space-x-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* 북마크 버튼 */}
                    {project.id && isAuthenticated() && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <FavoriteButton 
                          projectId={project.id} 
                          isFavorite={favoriteProjectIds.includes(project.id)}
                          userId={getCurrentUserId()!}
                          onToggle={(newState) => {
                            // sessionStorage에 개별 프로젝트 즐겨찾기 상태 저장
                            sessionStorageUtils.setFavoriteStatus(project.id!, newState);
                            
                            // 로컬 상태 업데이트
                            if (newState) {
                              setFavoriteProjectIds(prev => [...prev, project.id!]);
                            } else {
                              setFavoriteProjectIds(prev => prev.filter(id => id !== project.id));
                            }
                          }}
                        />
                      </div>
                    )}
                    {project.recruitmentType && (
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded" style={{ backgroundColor: '#dcfce7', color: '#166534', fontSize: '12px', padding: '4px 8px', borderRadius: '4px' }}>
                        {getRecruitmentTypeText(project.recruitmentType)}
                      </span>
                    )}
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded" style={{ backgroundColor: '#dbeafe', color: '#1e40af', fontSize: '12px', padding: '4px 8px', borderRadius: '4px' }}>
                      {getStatusText(project.status)}
                    </span>
                    {project.endDate && (
                      <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded" style={{ backgroundColor: '#fee2e2', color: '#dc2626', fontSize: '12px', padding: '4px 8px', borderRadius: '4px' }}>
                        {calculateDday(project.endDate)}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="mb-3" style={{ marginBottom: '12px' }}>
                  <span className="text-sm text-gray-600" style={{ fontSize: '14px', color: '#4b5563' }}>
                    {getProjectFieldText(project.projectField)}
                  </span>
                </div>

                <div className="text-sm text-gray-600 space-y-1" style={{ fontSize: '14px', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>예상비용: {getBudgetTypeText(project.budgetType)}</div>
                  {project.startDate && project.endDate && (
                    <div>
                      기간: {new Date(project.startDate).toLocaleDateString()} ~ {new Date(project.endDate).toLocaleDateString()}
                    </div>
                  )}
                  <div className="flex items-center space-x-4" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span>지원자수: {project.applicantCount || 0}명</span>
                    {project.companyLocation && (
                      <span>지역: {getLocationText(project.companyLocation)}</span>
                    )}
                  </div>
                </div>

                <p className="text-gray-700 mb-3 line-clamp-2" style={{ color: '#374151', marginTop: '8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{project.description}</p>
              </div>
            ))}

            {/* 페이지네이션 */}
            {!loading && totalPages > 1 && (
              <div className="flex justify-center space-x-2 mt-6" style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
                <button
                  className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50"
                  style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: 'white', cursor: currentPage === 0 ? 'not-allowed' : 'pointer', opacity: currentPage === 0 ? 0.5 : 1 }}
                  disabled={currentPage === 0}
                  onClick={() => fetchProjects(currentPage - 1, searchQuery, filters)}
                >
                  이전
                </button>
                
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(0, Math.min(totalPages - 5, currentPage - 2)) + i;
                  return (
                    <button
                      key={pageNum}
                      className={`px-3 py-2 border rounded ${
                        currentPage === pageNum
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                      style={{
                        padding: '8px 12px',
                        border: `1px solid ${currentPage === pageNum ? '#f97316' : '#d1d5db'}`,
                        borderRadius: '4px',
                        backgroundColor: currentPage === pageNum ? '#f97316' : 'white',
                        color: currentPage === pageNum ? 'white' : '#374151',
                        cursor: 'pointer'
                      }}
                      onClick={() => fetchProjects(pageNum, searchQuery, filters)}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}

                <button
                  className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50"
                  style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: 'white', cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages - 1 ? 0.5 : 1 }}
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => fetchProjects(currentPage + 1, searchQuery, filters)}
                >
                  다음
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default ProjectsPage;

