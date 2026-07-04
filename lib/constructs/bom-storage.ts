import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { IGrantable } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/** Private S3 bucket for per-account BOM persistence (used by Rust gateway). */
export class BomStorage extends Construct {
  readonly bucket: Bucket;
  readonly bucketName: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.bucketName = this.bucket.bucketName;

    new CfnOutput(this, 'BomBucketName', {
      value: this.bucketName,
      description: 'S3 bucket for BOM artifacts',
      exportName: 'ProkuroBomBucketName',
    });
  }

  grantReadWrite(grantee: IGrantable) {
    this.bucket.grantReadWrite(grantee);
  }
}
