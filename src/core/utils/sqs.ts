import AWS from 'aws-sdk';
import fetch from 'cross-fetch';
import { log, LogLevel } from 'src/core/utils/logger';

global.fetch = fetch;

const client = new AWS.SQS({
  endpoint: process.env.SQS_ENDPOINT,
  region: process.env.REGION,
});

const QUEUE_URL = `${process.env.SQS_ENDPOINT}/${
  process.env.ENV === 'offline' ? 'queue' : process.env.AWS_ACCOUNT_ID
}/`;

export async function createSQSQueue(webhookId: string) {
  try {
    const queueName = `webhook-${
      process.env.ENV === 'offline' ? 'queue' : process.env.AWS_ACCOUNT_ID
    }-${webhookId}`;

    log(`Creating SQS queue ${queueName}}`);
    const result = await client
      .createQueue({
        QueueName: queueName,
        Attributes: {
          DelaySeconds: '60',
          MessageRetentionPeriod: '86400',
        },
      })
      .promise();
    log(
      `Successfully created SQS queue. Url: ${result.QueueUrl}`,
      LogLevel.DEBUG
    );

    return result.QueueUrl;
  } catch (err: any) {
    log(`Unable to create SQS queue. Error: ${err.stack}`);
    throw err;
  }
}

export async function pushToSQS(queueName: string, content: any) {
  try {
    log(
      `Pushing event to queue ${queueName}. Model: ${JSON.stringify(content)}`
    );
    const result = await client
      .sendMessage({
        QueueUrl: QUEUE_URL + queueName,
        MessageBody: JSON.stringify(content),
        MessageGroupId: 'event',
      })
      .promise();
    log(
      `Successfully published event to SQS. Message ID: ${result.MessageId}`,
      LogLevel.DEBUG
    );
    return result;
  } catch (err: any) {
    log(`Unable to publish event to SQS. Error: ${err.stack}`);
    throw err;
  }
}

async function handleMessage(
  handlerFunc: (params: any) => any,
  body: any
): Promise<boolean> {
  try {
    const result = await handlerFunc(JSON.parse(body));
    log(
      `Handling of SQS event completed with result ${JSON.stringify(result)}`,
      LogLevel.INFO
    );
    return true;
  } catch (error: any) {
    log(
      `Error was found during working on model ${body}\n${error.stack}`,
      LogLevel.DEBUG
    );
    return false;
  }
}

export async function handleSqsEvent(
  handlerFunc: (params: any) => any,
  event: any
) {
  const records = event.Records;
  for (let i = 0; i < records.length; i++) {
    /* eslint-disable no-await-in-loop */
    let isSuccess = false;
    while (!isSuccess) {
      isSuccess = await handleMessage(handlerFunc, records[i].body);
    }
  }
}
