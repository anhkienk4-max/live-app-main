import 'server-only'
import { authorizationErrorResponse, isAuthorizationError, requireRole,
  type ServerUserResolver } from '@/lib/server/authGuards'

type Environment=Record<string,string|undefined>

function valid(value:string|undefined,pattern:RegExp):string|null{
  const normalized=value?.trim()??''
  return pattern.test(normalized)?normalized:null
}

export function createReleaseProvenanceHandler(options:{
  env?:Environment
  resolveUser?:ServerUserResolver
}={}){
  return async function GET(request:Request):Promise<Response>{
    const env=options.env??process.env
    try{
      await requireRole(request,'admin',options.resolveUser)
      const buildCommitSha=valid(env.RC19_BUILD_COMMIT_SHA,/^[a-f0-9]{40}$/iu)
        ??valid(env.VERCEL_GIT_COMMIT_SHA,/^[a-f0-9]{40}$/iu)
      const deploymentId=valid(env.VERCEL_DEPLOYMENT_ID,/^dpl_[A-Za-z0-9_-]{1,120}$/u)
      const workflowRunId=valid(env.RC19_BUILD_WORKFLOW_RUN_ID,/^\d{1,20}$/u)
      return Response.json({
        ok:true,
        provenance_status:buildCommitSha&&deploymentId?'complete':'incomplete',
        build_commit_sha:buildCommitSha?.toLowerCase()??null,
        deployment_id:deploymentId,
        build_workflow_run_id:workflowRunId,
        vercel_environment:valid(env.VERCEL_ENV,/^(production|preview|development)$/u),
      },{headers:{'Cache-Control':'no-store'}})
    }catch(error){
      if(isAuthorizationError(error))return authorizationErrorResponse(error)
      return Response.json({ok:false,error:{code:'RELEASE_PROVENANCE_UNAVAILABLE'}},
        {status:503,headers:{'Cache-Control':'no-store'}})
    }
  }
}
