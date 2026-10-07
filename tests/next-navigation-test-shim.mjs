// Node component tests have no Next app router. Match the existing link/image
// shims; browser/runtime builds always import the real next/navigation module.
import { createContext, useContext } from 'react'

export const NavigationTestContext = createContext({
  router: { push() {}, replace() {} },
  pathname: '/reports',
  searchParams: new URLSearchParams(),
})
export const useRouter = () => useContext(NavigationTestContext).router
export const usePathname = () => useContext(NavigationTestContext).pathname
export const useSearchParams = () => useContext(NavigationTestContext).searchParams
