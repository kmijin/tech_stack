import { useQuery } from '@tanstack/react-query'
import { fetchAllLatestVersions } from '../services/versionService'

export function useLatestVersions() {
  return useQuery({
    queryKey: ['latestVersions'],
    queryFn: fetchAllLatestVersions,
    staleTime: 1000 * 60 * 30,   // 30분 캐시 유지
    retry: 2,
  })
}
