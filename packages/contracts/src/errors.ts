export interface PublicError {code:string;message:string;retryable:boolean}
export class ReaderError extends Error {
  constructor(readonly code:string,message:string,readonly status=400,readonly retryable=false){super(message);this.name='ReaderError';}
  public():PublicError{return {code:this.code,message:this.message,retryable:this.retryable};}
}
export function publicError(error:unknown):PublicError {
  return error instanceof ReaderError?error.public():{code:'INTERNAL_ERROR',message:'操作失败，请查看本机诊断信息。',retryable:false};
}
