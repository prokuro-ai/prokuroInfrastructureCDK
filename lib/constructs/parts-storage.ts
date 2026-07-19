import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ITable, Table } from 'aws-cdk-lib/aws-dynamodb';
import { IGrantable } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * DynamoDB tables for Digi-Key enrichment cache.
 *
 * - parts: append-only snapshots (pk / fetched_at)
 * - unresolved: unmatched lookups (pk / first_seen)
 */
export class PartsStorage extends Construct {
  readonly partsTable: Table;
  readonly unresolvedTable: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.partsTable = new Table(this, 'Parts', {
      tableName: 'prokuro-parts',
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'fetched_at', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.unresolvedTable = new Table(this, 'Unresolved', {
      tableName: 'prokuro-unresolved',
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'first_seen', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    new CfnOutput(this, 'PartsTableName', {
      value: this.partsTable.tableName,
      description: 'Enrichment parts snapshot table',
      exportName: 'ProkuroPartsTableName',
    });

    new CfnOutput(this, 'UnresolvedTableName', {
      value: this.unresolvedTable.tableName,
      description: 'Enrichment unresolved lookups table',
      exportName: 'ProkuroUnresolvedTableName',
    });
  }

  grantReadWrite(grantee: IGrantable) {
    this.partsTable.grantReadWriteData(grantee);
    this.unresolvedTable.grantReadWriteData(grantee);
  }

  get tables(): ITable[] {
    return [this.partsTable, this.unresolvedTable];
  }
}
