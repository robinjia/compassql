import {Channel, supportMark} from 'vega-lite/src/channel';
import {Mark} from 'vega-lite/src/mark';

import {AbstractConstraint, AbstractConstraintModel} from './base';

import {Property} from '../property';
import {Schema} from '../schema';
import {SpecQueryModel, isEnumSpec} from '../query';
import {every, some} from '../util';


export interface SpecConstraintChecker {
  (specQ: SpecQueryModel, schema: Schema): boolean;
}

export class SpecConstraintModel extends AbstractConstraintModel {
  constructor(specConstraint: SpecConstraint) {
    super(specConstraint);
  }

  public satisfy(specQ: SpecQueryModel, schema: Schema) {
    // TODO: Re-order logic to optimize the "requireAllProperties" check

    if (this.constraint.requireAllProperties) {
      // TODO: extract as a method and do unit test
      const hasRequiredPropertyAsEnumSpec = some(this.constraint.properties,
        (property) => {
          switch(property) {
            // Mark
            case Property.MARK:
              return isEnumSpec(specQ.getMark());

            // TODO: transform

            // Encoding properties
            case Property.CHANNEL:
            case Property.AGGREGATE:
            case Property.BIN:
            case Property.TIMEUNIT:
            case Property.FIELD:
            case Property.TYPE:
              return some(specQ.getEncodings(), (encodingQuery) => {
                return isEnumSpec(encodingQuery[property]);
              });
            default:
              throw new Error('Unimplemnted');
          }
        }
      );
      // If one of the required property is still an enum spec, do not check the constraint yet.
      if (hasRequiredPropertyAsEnumSpec) {
        return true; // Return true since the query still satisfy the constraint.
      }
    }
    return (this.constraint as SpecConstraint).satisfy(specQ, schema);
  }
}

export interface SpecConstraint extends AbstractConstraint {
  /** Method for checking if the spec query satisfies this constraint. */
  satisfy: SpecConstraintChecker;
}

export const SPEC_CONSTRAINTS: SpecConstraintModel[] = [
  {
    name: 'channelPermittedByMarkType',
    description: 'Each encoding channel should be supported by the mark type',
    properties: [Property.CHANNEL, Property.MARK],
    requireAllProperties: false, // only require mark
    strict: true,
    satisfy: (specQ: SpecQueryModel, schema: Schema) => {
      const mark = specQ.getMark();

      // if mark is unspecified, no need to check
      if (isEnumSpec(mark)) return true;

      // TODO: can optimize this to detect only what's the changed property if needed.
      return every(specQ.getEncodings(), (encQ) => {
        // channel unspecified, no need to check
        if (isEnumSpec(encQ.channel)) return true;

        return supportMark(encQ.channel, mark as Mark);
      });
    }
  },
  // TODO: omitRawWithXYBothDimension
  {
    name: 'omitMultipleNonPositionalChannels',
    description: 'Do not use multiple non-positional encoding channel to avoid over-encoding.',
    properties: [Property.CHANNEL],
    requireAllProperties: false,
    strict: false,
    satisfy: (specQ: SpecQueryModel, schema: Schema) => {
      const encodings = specQ.getEncodings();
      let nonPositionChannelCount = 0;
      for (let i = 0; i < encodings.length; i++) {
        const channel = encodings[i].channel;
        if (!isEnumSpec(channel)) {
          if (channel === Channel.COLOR || channel === Channel.SHAPE || channel === Channel.SIZE) {
            nonPositionChannelCount += 1;
            if (nonPositionChannelCount > 1) {
              return false;
            }
          }
        }
      }
      return true;
    }
  },

  // TODO: hasAllRequiredChannelForMark
  // TODO: noRawTimeGroupingForAggregation
  {
    name: 'noRepeatedChannel',
    description: 'Each encoding channel should only be used once.',
    properties: [Property.CHANNEL],
    requireAllProperties: false,
    strict: true,
    satisfy: (specQ: SpecQueryModel, schema: Schema) => {
      let usedChannel = {};

      // channel for all encodings should be valid
      return every(specQ.getEncodings(), (encQ) => {
        if (!isEnumSpec(encQ.channel)) {
          // If channel is specified, it should no be used already
          if (usedChannel[encQ.channel]) {
            return false;
          }
          usedChannel[encQ.channel] = true;
          return true;
        }
        return true; // unspecified channel is valid
      });
    }
  },
  {
    name: 'noRepeatedField',
    description: 'Each field should be mapped to only one channel',
    properties: [Property.FIELD],
    requireAllProperties: false,
    strict: false, // over-encoding is sometimes good, but let's turn it off by default
    satisfy: (specQ: SpecQueryModel, schema: Schema) => {
      let usedField = {};

      // the same field should not be encoded twice
      return every(specQ.getEncodings(), (encQ) => {
        if (!isEnumSpec(encQ.field)) {
          // If field is specified, it should not be used already
          if (usedField[encQ.field]) {
            return false;
          }
          usedField[encQ.field] = true;
          return true;
        }
        return true; // unspecified field is valid
      });
    }
  }
].map((sc) => new SpecConstraintModel(sc));

export const SPEC_CONSTRAINT_INDEX: {[name: string]: SpecConstraintModel} =
  SPEC_CONSTRAINTS.reduce((m: any, c: SpecConstraintModel) => {
    m[c.name()] = c;
    return m;
  }, {});

export const SPEC_CONSTRAINTS_BY_PROPERTY: {[property: string]: SpecConstraintModel[]} =
   SPEC_CONSTRAINTS.reduce((m, c: SpecConstraintModel) => {
    c.properties().forEach((property) => {
      m[property] = m[property] || [];
      m[property].push(c);
    });
    return m;
  }, {});
