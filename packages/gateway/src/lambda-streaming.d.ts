/**
 * AWS Lambda Response Streaming types
 * Available when Lambda is configured with streaming enabled
 */

declare namespace awslambda {
  interface HttpResponseStream {
    write(chunk: string | Buffer): void;
    end(): void;
  }

  interface ResponseStreamMetadata {
    statusCode: number;
    headers: Record<string, string>;
  }

  const HttpResponseStream: {
    from(
      responseStream: NodeJS.WritableStream,
      metadata: ResponseStreamMetadata
    ): HttpResponseStream;
  };

  function streamifyResponse<T>(
    handler: (
      event: T,
      responseStream: NodeJS.WritableStream,
      context: any
    ) => Promise<void>
  ): (event: T, context: any) => Promise<void>;
}
