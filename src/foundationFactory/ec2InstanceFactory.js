'use strict'
const {ECS_OPTIMIZED_AMI_ID} = require('../constants')
const {createLogger, ec2, encodeBase64, vpcNetwork} = require('../util')

module.exports = function instanceFactory (options = {}) {
  const {ecsClusterName, getEc2InstanceProfileArn, ec2KeyPairName, name} = options
  const log = createLogger('EC2 instance', name)

  async function getId () {
    let id
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#describeInstances-property
    const {Reservations} = await ec2.describeInstancesAsync({
      Filters: [{Name: 'tag:Name', Values: [name]}],
    })
    for (let reservation of Reservations) {
      const {Instances} = reservation
      const filteredInstances = Instances.filter(function ({State}) {
        return State.Name === 'running' || State.Name === 'pending'
      })
      if (filteredInstances[0]) {
        id = filteredInstances[0].InstanceId
      }
    }
    return id
  }

  async function create () {
    const id = await getId()
    log.creating()
    if (id) {
      log.alreadyCreated()
    } else {
      const ec2InstanceProfileArn = await getEc2InstanceProfileArn()
      const securityGroupId = await vpcNetwork.getSecurityGroupId()
      await ec2.runInstancesAsync({
        ImageId: ECS_OPTIMIZED_AMI_ID,
        MaxCount: 1,
        MinCount: 1,
        BlockDeviceMappings: [
          {
            DeviceName: '/dev/xvda',
            Ebs: {
              DeleteOnTermination: true,
              VolumeSize: 8,
              VolumeType: 'gp2',
            },
          },
          {
            DeviceName: '/dev/xvdcz',
            Ebs: {
              DeleteOnTermination: true,
              VolumeSize: 22,
              VolumeType: 'gp2',
            },
          },
        ],
        DryRun: false,
        IamInstanceProfile: {Arn: ec2InstanceProfileArn},
        InstanceInitiatedShutdownBehavior: 'terminate',
        InstanceType: 't2.micro',
        KeyName: ec2KeyPairName,
        Monitoring: {Enabled: false},
        SecurityGroupIds: [securityGroupId],
        TagSpecifications: [{
          ResourceType: 'instance',
          Tags: [{Key: 'Name', Value: name}],
        }],
        UserData: encodeBase64(`#!/bin/bash\necho ECS_CLUSTER=${ecsClusterName} >> /etc/ecs/ecs.config`),
      })
      log.created()
    }
  }

  async function destroy () {
    const id = await getId()
    log.destroying()
    if (!id) {
      log.alreadyDestroyed()
    } else {
      await ec2.terminateInstancesAsync({InstanceIds: [id]})
      log.destroyed()
    }
  }

  return {
    create,
    destroy,
    getId,
    name,
  }
}
