import { useQuery } from '@tanstack/react-query'
import { fetchAllLatestVersions } from '../services/versionService'

export function useLatestVersions() {
  return useQuery({
    queryKey: ['latestVersions'],
    queryFn: fetchAllLatestVersions,
    staleTime: 1000 * 60 * 30,   // 30분 캐시 유지
    gcTime:   1000 * 60 * 35,    // staleTime보다 길게 — 언마운트 시 조기 삭제 방지
    retry: 2,
  })
}
