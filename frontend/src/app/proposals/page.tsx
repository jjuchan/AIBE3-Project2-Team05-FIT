'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/app/context/UserContext'
import { apiClient } from '@/lib/backend/client'
import { useRouter } from 'next/navigation'
import { ProposalCard } from './_components/ProposalCard'
import { AcceptRejectModal } from './_components/AcceptRejectModal'
import { ChatModal } from '@/components/ChatModal'

interface Proposal {
  id: number
  projectId: number
  projectTitle: string
  pmId: number
  pmName: string
  freelancerId: number
  freelancerName: string
  message: string
  status: string
  responseMessage?: string
  rejectionReason?: string
  responseDate?: string
  createdAt: string
  updatedAt: string
}

// 인라인 LoadingSpinner 컴포넌트
function InlineLoadingSpinner() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '400px'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '64px',
          height: '64px',
          border: '4px solid #16a34a',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px'
        }} />
        <p style={{ color: '#666', fontSize: '16px' }}>로딩 중...</p>
      </div>
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// 인라인 EmptyState 컴포넌트
function InlineEmptyState({
  icon = '📮',
  title,
  description,
  action
}: {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '13px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      padding: '64px 32px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>{icon}</div>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: '#222' }}>{title}</h2>
      {description && (
        <p style={{ color: '#666', marginBottom: '16px', fontSize: '15px' }}>{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            background: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 24px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#15803d'}
          onMouseOut={(e) => e.currentTarget.style.background = '#16a34a'}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export default function ProposalsPage() {
  const { user, roles, isLoading: authLoading } = useUser()
  const router = useRouter()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'accept' | 'reject'>('accept')
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null)
  const [chatModalOpen, setChatModalOpen] = useState(false)
  const [chatTarget, setChatTarget] = useState<{
    freelancerId: number
    receiverId: number
    receiverName: string
    projectId: number
    projectTitle: string
  } | null>(null)
  const [isFreelancer, setIsFreelancer] = useState<boolean | null>(null)

  const isPm = isFreelancer === false

  useEffect(() => {
    if (authLoading || !user) return

    const hasFreelancerRole = roles.includes('FREELANCER')
    setIsFreelancer(hasFreelancerRole)
    console.log('[Proposals] Freelancer role check:', { roles, hasFreelancerRole })
  }, [user, authLoading, roles])

  useEffect(() => {
    if (!authLoading && !user) {
      alert('로그인이 필요합니다.')
      router.push('/members/login')
      return
    }

    if (isFreelancer === null) {
      return
    }

    if (!authLoading && user) {
      loadProposals()
    }
  }, [user, authLoading, isFreelancer, router])

  useEffect(() => {
    if (proposals.length > 0) {
      const params = new URLSearchParams(window.location.search)
      const proposalId = params.get('id')
      if (proposalId) {
        setTimeout(() => {
          const element = document.getElementById(`proposal-${proposalId}`)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            element.style.outline = '3px solid #16a34a'
            element.style.outlineOffset = '4px'
            setTimeout(() => {
              element.style.outline = ''
              element.style.outlineOffset = ''
            }, 3000)
          }
        }, 100)
      }
    }
  }, [proposals])

  const loadProposals = async () => {
    try {
      const response = await apiClient.get<Proposal[]>('/api/v1/proposals')
      setProposals(response.data)
    } catch (error) {
      console.error('Failed to load proposals:', error)
      alert(error instanceof Error ? error.message : '제안 목록 로딩 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAccept = (id: number) => {
    const proposal = proposals.find(p => p.id === id)
    if (!proposal) return

    setSelectedProposal(proposal)
    setModalType('accept')
    setModalOpen(true)
  }

  const handleReject = (id: number) => {
    const proposal = proposals.find(p => p.id === id)
    if (!proposal) return

    setSelectedProposal(proposal)
    setModalType('reject')
    setModalOpen(true)
  }

  const handleModalSubmit = async (message: string, reason?: string) => {
    if (!selectedProposal) return

    try {
      if (modalType === 'accept') {
        await apiClient.put(`/api/v1/proposals/${selectedProposal.id}/accept`, {
          responseMessage: message
        })
        alert('제안을 수락했습니다.')
      } else {
        await apiClient.put(`/api/v1/proposals/${selectedProposal.id}/reject`, {
          responseMessage: message,
          rejectionReason: reason || ''
        })
        alert('제안을 거절했습니다.')
      }
      loadProposals()
    } catch (error) {
      alert(error instanceof Error ? error.message : '처리 실패')
    }
  }

  const handleSendMessage = (freelancerId: number, receiverId: number, receiverName: string, projectId: number, projectTitle: string) => {
    setChatTarget({ freelancerId, receiverId, receiverName, projectId, projectTitle })
    setChatModalOpen(true)
  }

  const handleCancel = async (id: number) => {
    if (!confirm('제안을 취소하시겠습니까?')) return

    try {
      await apiClient.delete(`/api/v1/proposals/${id}`)
      alert('제안이 취소되었습니다.')
      loadProposals()
    } catch (error) {
      alert(error instanceof Error ? error.message : '취소 실패')
    }
  }

  if (authLoading || isLoading || isFreelancer === null || isFreelancer === undefined) {
    return (
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '32px 16px'
      }}>
        <InlineLoadingSpinner />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f7f5ec',
      fontFamily: "'Pretendard', 'Inter', Arial, sans-serif"
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '40px 16px'
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 800,
          marginBottom: '32px',
          color: '#333',
          letterSpacing: '-1px'
        }}>
          {isPm ? '보낸 제안 목록' : '받은 제안 목록'}
        </h1>

        {proposals.length === 0 ? (
          <InlineEmptyState
            icon="📮"
            title={isPm ? '보낸 제안이 없습니다' : '받은 제안이 없습니다'}
            description={
              isPm
                ? '매칭 결과에서 프리랜서에게 제안을 보내보세요.'
                : '아직 받은 제안이 없습니다.'
            }
            action={
              isPm
                ? {
                    label: '매칭 서비스',
                    onClick: () => router.push('/projects')
                  }
                : undefined
            }
          />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '24px'
          }}>
            {proposals.map((proposal) => (
              <div key={proposal.id} id={`proposal-${proposal.id}`}>
                <ProposalCard
                  proposal={proposal}
                  isPm={isPm}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onCancel={handleCancel}
                  onSendMessage={() => handleSendMessage(
                    proposal.freelancerId,
                    isPm ? proposal.freelancerId : proposal.pmId,
                    isPm ? proposal.freelancerName : proposal.pmName,
                    proposal.projectId,
                    proposal.projectTitle
                  )}
                />
              </div>
            ))}
          </div>
        )}

        {/* Accept/Reject Modal */}
        {selectedProposal && (
          <AcceptRejectModal
            type={modalType}
            open={modalOpen}
            onOpenChange={setModalOpen}
            onSubmit={handleModalSubmit}
            proposalInfo={{
              projectTitle: selectedProposal.projectTitle,
              freelancerName: selectedProposal.freelancerName
            }}
          />
        )}

        {/* Chat Modal */}
        {chatTarget && (
          <ChatModal
            isOpen={chatModalOpen}
            onClose={() => setChatModalOpen(false)}
            projectId={chatTarget.projectId}
            freelancerId={chatTarget.freelancerId}
            receiverId={chatTarget.receiverId}
            receiverName={chatTarget.receiverName}
            projectTitle={chatTarget.projectTitle}
          />
        )}
      </div>
    </div>
  )
}
