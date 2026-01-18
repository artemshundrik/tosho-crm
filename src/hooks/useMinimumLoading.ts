import { useEffect, useState } from "react";
import { SKELETON_CONSTANTS } from "@/lib/skeletonConstants";

/**
 * Hook для гарантування мінімального часу показу skeleton loading стану.
 * Запобігає миганню при швидкому завантаженні даних.
 *
 * @param loading - чи зараз відбувається завантаження
 * @param minMs - мінімальний час показу skeleton (за замовчуванням 400ms)
 * @returns чи потрібно показувати skeleton
 */
export function useMinimumLoading(loading: boolean, minMs = SKELETON_CONSTANTS.MIN_DURATION_MS) {
  const [show, setShow] = useState(loading);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/11b5ec69-b54d-4e33-804b-27523a2e1ba6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useMinimumLoading.ts:13',message:'hook called',data:{loading,show,minMs},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,C',runId:'post-fix'})}).catch(()=>{});
  // #endregion

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/11b5ec69-b54d-4e33-804b-27523a2e1ba6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useMinimumLoading.ts:16',message:'useEffect triggered',data:{loading,show,minMs},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,C',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    
    if (loading) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/11b5ec69-b54d-4e33-804b-27523a2e1ba6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useMinimumLoading.ts:19',message:'loading=true, setShow(true)',data:{loading,show},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      setShow(true);
      return;
    }

    // FIX: Якщо show вже false, не потрібен таймер
    if (!show) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/11b5ec69-b54d-4e33-804b-27523a2e1ba6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useMinimumLoading.ts:27',message:'show already false, skip timer',data:{loading,show},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      return;
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/11b5ec69-b54d-4e33-804b-27523a2e1ba6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useMinimumLoading.ts:33',message:'loading=false, setting timer',data:{loading,show,minMs},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,C',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    const timer = window.setTimeout(() => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/11b5ec69-b54d-4e33-804b-27523a2e1ba6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useMinimumLoading.ts:37',message:'timer fired, setShow(false)',data:{show},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      setShow(false);
    }, minMs);
    return () => window.clearTimeout(timer);
  }, [loading, minMs, show]);

  return show;
}
