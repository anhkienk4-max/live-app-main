import React from 'react'

export default function dynamic(_dynamicOptions, _options) {
  return function MockedDynamicComponent(_props) {
    return React.createElement('div', { 'data-testid': 'mocked-dynamic' }, 'MockedDynamicComponent')
  }
}
